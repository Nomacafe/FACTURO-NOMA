import "dotenv/config"
import express from "express"
import cors from "cors"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
import bcryptPkg from "bcryptjs"
const bcrypt = bcryptPkg
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const jwt = require("jsonwebtoken")
const multer = require("multer")
import Anthropic from "@anthropic-ai/sdk"
import sharp from "sharp"
const heicConvertPkg = require("heic-convert")
const heicConvert = heicConvertPkg.default ?? heicConvertPkg

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const isProd = process.env.NODE_ENV === "production"
app.use(cors({ origin: isProd ? false : "http://localhost:5173" }))
app.use(express.json())

const JWT_SECRET = process.env.JWT_SECRET ?? "facturo-secret"
const JWT_EXPIRY = "7d"

// Hash le mot de passe au démarrage (évite de stocker le hash en clair dans .env)
let passwordHash = null
async function initAuth() {
  const plain = process.env.ADMIN_PASSWORD ?? "Noma2026!"
  passwordHash = await bcrypt.hash(plain, 10)
  console.log(`Auth initialisé · utilisateur : ${process.env.ADMIN_USERNAME ?? "admin"}`)
}

// ─── Middleware JWT ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Non authentifié" })
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ ok: false, error: "Token invalide ou expiré" })
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {}
  const expectedUser = process.env.ADMIN_USERNAME ?? "admin"

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Identifiants manquants" })
  }

  const usernameMatch = username.trim().toLowerCase() === expectedUser.toLowerCase()
  const passwordMatch = await bcrypt.compare(password, passwordHash)

  if (!usernameMatch || !passwordMatch) {
    return res.status(401).json({ ok: false, error: "Identifiant ou mot de passe incorrect" })
  }

  const token = jwt.sign({ username: expectedUser }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
  res.json({ ok: true, token, username: expectedUser })
})

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.username })
})

// ─── POST /api/invoice/parse (protégé) ───────────────────────────────────────

const CLAUDE_SUPPORTED_IMAGES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"])
const CONVERT_TO_JPEG_EXTS = new Set(["heic", "heif", "avif", "tiff", "tif", "bmp"])

const INVOICE_PROMPT = `Tu es un assistant comptable expert en lecture de factures françaises.
Analyse ce document (facture, ticket de caisse, reçu) et extrais les informations suivantes.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après.

Format de réponse :
{
  "vendor": "Nom du fournisseur ou de l'établissement",
  "invoiceDate": "YYYY-MM-DD ou null si non trouvé",
  "invoiceNumber": "Numéro de facture ou null si absent",
  "tvaLines": [
    { "baseHT": 100.00, "rate": 20, "montantTVA": 20.00 }
  ],
  "confidence": "high|medium|low"
}

Règles importantes :
- tvaLines doit contenir une entrée PAR taux de TVA différent (20%, 10%, 5.5%, 2.1%, 0%)
- baseHT et montantTVA sont des nombres décimaux (pas de chaînes)
- rate doit être exactement l'un de ces nombres : 0, 2.1, 5.5, 10, 20
- Si la TVA n'est pas visible mais que le TTC est connu, déduis le HT avec TVA 20%
- confidence = "high" si tous les champs sont clairs, "medium" si quelques doutes, "low" si peu lisible
- Pour les tickets de caisse sans TVA explicite, utilise le taux approprié selon le type de produit`

app.post("/api/invoice/parse", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Aucun fichier reçu" })

  let { mimetype, buffer } = req.file
  const { originalname } = req.file
  const ext = (originalname.split(".").pop() ?? "").toLowerCase()

  console.log(`[parse] fichier reçu : ${originalname} | mime: ${mimetype} | ext: ${ext} | taille: ${buffer.length}`)

  try {
    // Convertir HEIC/HEIF (iPhone) en JPEG via heic-convert
    const isHeic = ext === "heic" || ext === "heif" || mimetype === "image/heic" || mimetype === "image/heif"
    if (isHeic) {
      console.log("[parse] conversion HEIC → JPEG")
      const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.92 })
      buffer = Buffer.from(converted)
      mimetype = "image/jpeg"
      console.log("[parse] conversion HEIC OK, taille JPEG:", buffer.length)
    }
    // Convertir AVIF, TIFF, BMP en JPEG via sharp
    else if (CONVERT_TO_JPEG_EXTS.has(ext) || mimetype === "image/avif" || mimetype === "image/tiff" || mimetype === "image/bmp") {
      console.log(`[parse] conversion ${ext} → JPEG via sharp`)
      buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer()
      mimetype = "image/jpeg"
    }

    const IMAGE_EXTS_INV = new Set(["jpg","jpeg","png","gif","webp"])
    const isPdfInv = ext === "pdf" || mimetype === "application/pdf"
    const isImageInv = IMAGE_EXTS_INV.has(ext) || CLAUDE_SUPPORTED_IMAGES.has(mimetype)

    let contentBlock
    if (isPdfInv) {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    } else if (isImageInv) {
      contentBlock = {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: buffer.toString("base64") },
      }
    } else {
      return res.status(415).json({
        ok: false,
        error: `Format "${ext}" non reconnu. Envoyez une photo (JPG, PNG, HEIC) ou un PDF.`,
      })
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: INVOICE_PROMPT }],
        },
      ],
    })

    const raw = message.content[0]?.text ?? ""
    // Extrait le JSON même si Claude ajoute du texte autour
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Réponse IA invalide")

    const parsed = JSON.parse(match[0])
    res.json({ ok: true, ...parsed })
  } catch (err) {
    console.error("[parse] ERREUR:", err.message, err.stack?.split("\n")[1])
    res.status(500).json({ ok: false, error: err.message ?? "Erreur analyse IA" })
  }
})

// ─── Persistance données (store.json) ────────────────────────────────────────

const DATA_DIR = join(__dirname, "data")
const STORE_FILE = join(DATA_DIR, "store.json")

function readStore() {
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf8"))
  } catch {
    return {}
  }
}

function writeStore(data) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8")
}

app.get("/api/store", requireAuth, (req, res) => {
  res.json({ ok: true, ...readStore() })
})

app.put("/api/store", requireAuth, (req, res) => {
  const { invoices, expenses, revenues } = req.body ?? {}
  const existing = readStore()
  writeStore({
    ...existing,
    ...(invoices !== undefined && { invoices }),
    ...(expenses !== undefined && { expenses }),
    ...(revenues !== undefined && { revenues }),
  })
  res.json({ ok: true })
})

// ─── Parser CSV Square ───────────────────────────────────────────────────────

function parseCsvLine(line) {
  const cols = []
  let cur = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if ((c === ',' || c === ';') && !inQ) { cols.push(cur.trim()); cur = "" }
    else { cur += c }
  }
  cols.push(cur.trim())
  return cols.map(c => c.replace(/^"|"$/g, "").trim())
}

function parseNum(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0
}

function detectMonth(text) {
  const MONTHS_FR = ["janvier","février","fevrier","mars","avril","mai","juin","juillet","août","aout","septembre","octobre","novembre","décembre","decembre"]
  // Mois FR → numéro 1-12 (janvier=1, en tenant compte des doublons avec accent)
  const MONTHS_NUM = [1,2,2,3,4,5,6,7,8,8,9,10,11,12,12]
  const lower = text.toLowerCase()
  const isoMatch = lower.match(/(\d{4})-(\d{2})-\d{2}/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`
  const frMatch = lower.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (frMatch) return `${frMatch[3]}-${frMatch[2].padStart(2, "0")}`
  for (let i = 0; i < MONTHS_FR.length; i++) {
    if (lower.includes(MONTHS_FR[i])) {
      const yearMatch = lower.match(/(\d{4})/)
      if (yearMatch) return `${yearMatch[1]}-${String(MONTHS_NUM[i]).padStart(2, "0")}`
    }
  }
  return null
}

function parseSquareCsv(buffer) {
  let text = buffer.toString("utf8")
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const firstLine = lines[0].toLowerCase()

  // ── Format Récapitulatif (lignes = métriques, colonnes = valeurs) ─────────
  if (firstLine.includes("récapitulatif") || firstLine.includes("recapitulatif") || firstLine.includes("summary")) {
    let detectedMonth = null
    // Chercher le mois dans les 5 premières lignes
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      detectedMonth = detectMonth(lines[i])
      if (detectedMonth) break
    }

    let cabrut = null, canet = null, transactions = 0

    for (const line of lines) {
      const cols = parseCsvLine(line)
      if (cols.length < 2) continue
      const key = cols[0].toLowerCase().trim()
      // Sommer toutes les colonnes numériques de la ligne (exports multi-jours)
      const total = cols.slice(1)
        .map(c => parseNum(c))
        .reduce((a, b) => a + b, 0)

      if (key === "ventes brutes" || key === "gross sales") cabrut = total
      else if (key === "ventes nettes" || key === "net sales") canet = total
      else if ((key === "total des ventes" || key === "total sales") && cabrut === null) cabrut = total
      else if (key === "nombre total de ventes" || key === "transactions de vente" || key === "total transactions" || key === "total des transactions de vente") transactions = Math.round(total)
    }

    if (cabrut === null && canet === null) return []

    return [{
      month: detectedMonth, // null si non détecté → frontend demandera le mois
      cabrut: Math.round((cabrut ?? canet ?? 0) * 100) / 100,
      canet: Math.round((canet ?? cabrut ?? 0) * 100) / 100,
      transactions,
    }]
  }

  // ── Format Transactions (une ligne par transaction) ───────────────────────
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase())

  const colDate = headers.findIndex(h => h === "date")
  const colAmount = headers.findIndex(h => ["amount", "montant", "gross sales", "ventes brutes"].includes(h))
  const colNet = headers.findIndex(h => ["net", "net total", "net sales", "ventes nettes"].includes(h))
  const colFee = headers.findIndex(h => ["fee", "frais", "fees"].includes(h))
  const colEvent = headers.findIndex(h => ["event type", "type d'événement", "transaction type"].includes(h))

  if (colDate === -1 || colAmount === -1) return []

  const byMonth = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 2) continue
    const eventType = colEvent >= 0 ? cols[colEvent].toLowerCase() : ""
    if (eventType.includes("refund") || eventType.includes("remboursement") || eventType.includes("void")) continue

    const month = detectMonth(cols[colDate] ?? "")
    if (!month) continue

    const amount = parseNum(cols[colAmount])
    if (amount <= 0) continue

    let net = amount
    if (colNet >= 0 && cols[colNet]) net = parseNum(cols[colNet]) || amount
    else if (colFee >= 0 && cols[colFee]) net = amount - (parseNum(cols[colFee]) || 0)

    if (!byMonth[month]) byMonth[month] = { month, cabrut: 0, canet: 0, transactions: 0 }
    byMonth[month].cabrut += amount
    byMonth[month].canet += net
    byMonth[month].transactions += 1
  }

  return Object.values(byMonth)
    .map(m => ({ ...m, cabrut: Math.round(m.cabrut * 100) / 100, canet: Math.round(m.canet * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ─── POST /api/square/parse-report (protégé) ─────────────────────────────────

const SQUARE_REPORT_PROMPT = `Tu es un assistant comptable expert en analyse de rapports de ventes Square (caisse enregistreuse).
Analyse ce document (rapport PDF, export CSV, capture d'écran Square Dashboard) et extrais les données de CA par mois.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après.

Format de réponse :
{
  "months": [
    {
      "month": "2026-03",
      "cabrut": 15234.50,
      "canet": 13849.55,
      "transactions": 456,
      "notes": "info utile si trouvée"
    }
  ],
  "periode": "description de la période couverte si lisible"
}

Règles importantes :
- month TOUJOURS au format YYYY-MM (ex: 2026-03 pour mars 2026)
- cabrut = CA total TTC encaissé (montant brut des ventes, avant frais)
- canet = CA net HT (si disponible) ou CA après déduction des frais Square. Si non précisé, mets la même valeur que cabrut
- transactions = nombre de transactions/ventes (0 si non précisé)
- Si le rapport couvre plusieurs mois, crée une entrée par mois
- Si le rapport couvre une seule période, crée une entrée pour ce mois-là
- Convertis les virgules en points pour les décimaux
- Ignore les remboursements/refunds sauf si le rapport en donne un net déjà calculé`

app.post("/api/square/parse-report", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Aucun fichier reçu" })

  let { mimetype, buffer } = req.file
  const { originalname } = req.file
  const ext = (originalname.split(".").pop() ?? "").toLowerCase()

  console.log(`[square-report] fichier reçu : ${originalname} | mime: ${mimetype} | ext: ${ext}`)

  try {
    // Convertir HEIC en JPEG
    const isHeic = ext === "heic" || ext === "heif" || mimetype === "image/heic" || mimetype === "image/heif"
    if (isHeic) {
      const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.92 })
      buffer = Buffer.from(converted)
      mimetype = "image/jpeg"
    } else if (CONVERT_TO_JPEG_EXTS.has(ext) || mimetype === "image/avif" || mimetype === "image/tiff" || mimetype === "image/bmp") {
      buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer()
      mimetype = "image/jpeg"
    }

    // CSV : parser directement sans IA
    if (ext === "csv" || mimetype === "text/csv" || mimetype === "text/plain" || mimetype === "application/octet-stream" && ext === "csv") {
      const months = parseSquareCsv(buffer)
      if (months.length === 0) {
        return res.status(422).json({ ok: false, error: "Aucune transaction détectée dans le CSV. Vérifiez que c'est bien un export Square (Transactions)." })
      }
      console.log(`[square-report] CSV parsé : ${months.length} mois`)
      return res.json({ ok: true, months, periode: null })
    }

    const IMAGE_EXTS = new Set(["jpg","jpeg","png","gif","webp"])
    const isPdf = ext === "pdf" || mimetype === "application/pdf"
    const isImage = IMAGE_EXTS.has(ext) || CLAUDE_SUPPORTED_IMAGES.has(mimetype)

    let contentBlock
    if (isPdf) {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    } else if (isImage) {
      contentBlock = {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: buffer.toString("base64") },
      }
    } else {
      return res.status(415).json({
        ok: false,
        error: `Format "${ext}" non reconnu. Envoyez un PDF, une image (JPG/PNG) ou un export CSV Square.`,
      })
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: SQUARE_REPORT_PROMPT }],
        },
      ],
    })

    const raw = message.content[0]?.text ?? ""
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Réponse IA invalide")

    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.months) || parsed.months.length === 0) {
      throw new Error("Aucun mois détecté dans le document")
    }

    console.log(`[square-report] ${parsed.months.length} mois détectés`)
    res.json({ ok: true, months: parsed.months, periode: parsed.periode ?? null })
  } catch (err) {
    console.error("[square-report] ERREUR:", err.message)
    res.status(500).json({ ok: false, error: err.message ?? "Erreur analyse IA" })
  }
})

// ─── GET /api/health ──────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }))

// ─── Frontend statique (production) ──────────────────────────────────────────

const distPath = join(__dirname, "../dist")
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get("*", (_req, res) => res.sendFile(join(distPath, "index.html")))
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001
initAuth().then(() => {
  app.listen(PORT, () => console.log(`Serveur Facturo démarré sur http://localhost:${PORT}`))
})

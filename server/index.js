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
import squarePkg from "square"

const { SquareClient, SquareEnvironment } = squarePkg

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const isProd = process.env.NODE_ENV === "production"
app.use(cors({ origin: isProd ? false : "http://localhost:5173" }))
app.use(express.json())

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production,
})

const LOCATION_ID = process.env.SQUARE_LOCATION_ID
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

    let contentBlock

    if (mimetype === "application/pdf") {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    } else if (CLAUDE_SUPPORTED_IMAGES.has(mimetype)) {
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

// ─── Helper : agrège les commandes par mois ──────────────────────────────────

function groupByMonth(orders) {
  const map = {}

  for (const o of orders) {
    if (!o.createdAt) continue
    if (o.state !== "COMPLETED") continue

    const month = new Date(o.createdAt).toISOString().slice(0, 7)
    if (!map[month]) {
      map[month] = { month, totalTTC: 0, tvaCollectee: 0, transactions: 0 }
    }

    const tenders = (o.tenders ?? []).filter(t => t.type !== "NO_SALE")
    if (tenders.length === 0) continue

    const ttc = tenders.reduce((sum, t) => sum + Number(t.amountMoney?.amount ?? 0), 0) / 100
    if (Math.abs(ttc) < 0.01) continue

    const tvaRaw = Number(o.totalTaxMoney?.amount ?? 0) / 100
    const tva = tvaRaw > 0 ? tvaRaw : Math.round((ttc - ttc / 1.1) * 100) / 100

    map[month].totalTTC += ttc
    map[month].tvaCollectee += tva
    if (ttc > 0) map[month].transactions += 1
  }

  return Object.values(map)
    .map((m) => ({
      ...m,
      totalTTC: Math.round(m.totalTTC * 100) / 100,
      tvaCollectee: Math.round(m.tvaCollectee * 100) / 100,
      caNet: Math.round((m.totalTTC - m.tvaCollectee) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

// ─── GET /api/square/sync (protégé) ──────────────────────────────────────────

app.get("/api/square/sync", requireAuth, async (req, res) => {
  try {
    const startDate = req.query.from ?? "2025-10-01T00:00:00Z"
    const endDate = new Date().toISOString()

    let orders = []
    let cursor = undefined

    do {
      const result = await square.orders.search({
        locationIds: [LOCATION_ID],
        query: {
          filter: {
            dateTimeFilter: { createdAt: { startAt: startDate, endAt: endDate } },
            stateFilter: { states: ["COMPLETED"] },
          },
          sort: { sortField: "CREATED_AT", sortOrder: "ASC" },
        },
        limit: 500,
        ...(cursor && { cursor }),
      })
      orders = orders.concat(result.orders ?? [])
      cursor = result.cursor ?? null
    } while (cursor)

    console.log(`[sync] ${orders.length} commandes récupérées`)

    const monthly = groupByMonth(orders)
    console.log(`[sync] mensuel:`, monthly.map(m => `${m.month}=${m.totalTTC}`).join(", "))
    res.json({ ok: true, months: monthly, total: orders.length })
  } catch (err) {
    console.error("Square API error:", err)
    res.status(500).json({ ok: false, error: err.message ?? "Erreur Square" })
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

function parseSquareCsv(buffer) {
  // Gérer BOM UTF-8 et encodage
  let text = buffer.toString("utf8")
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // Enlever BOM

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  // Parser une ligne CSV (gère les guillemets)
  function parseLine(line) {
    const cols = []
    let cur = "", inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = "" }
      else { cur += c }
    }
    cols.push(cur.trim())
    return cols
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, "").toLowerCase().trim())

  // Colonnes Square connues (EN et FR)
  const colDate = headers.findIndex(h => h === "date" || h === "date" )
  const colAmount = headers.findIndex(h => h === "amount" || h === "montant" || h === "gross sales" || h === "ventes brutes")
  const colNet = headers.findIndex(h => h === "net" || h === "net total" || h === "net sales" || h === "ventes nettes")
  const colFee = headers.findIndex(h => h === "fee" || h === "frais" || h === "fees")
  const colEvent = headers.findIndex(h => h === "event type" || h === "type d'événement" || h === "transaction type")

  if (colDate === -1 || colAmount === -1) return []

  const byMonth = {}

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    if (cols.length < 2) continue

    // Ignorer les remboursements et annulations
    const eventType = colEvent >= 0 ? (cols[colEvent] ?? "").toLowerCase() : ""
    if (eventType.includes("refund") || eventType.includes("remboursement") || eventType.includes("void")) continue

    const dateRaw = (cols[colDate] ?? "").replace(/^"|"$/g, "").trim()
    if (!dateRaw) continue

    // Détecter le format de date : MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
    let month = null
    const isoMatch = dateRaw.match(/^(\d{4})-(\d{2})-\d{2}/)
    const slashMatch = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (isoMatch) {
      month = `${isoMatch[1]}-${isoMatch[2]}`
    } else if (slashMatch) {
      // Square US = MM/DD/YYYY, Square FR peut être DD/MM/YYYY
      // On suppose MM/DD/YYYY (format Square par défaut)
      const m = slashMatch[1].padStart(2, "0")
      const y = slashMatch[3]
      month = `${y}-${m}`
    }
    if (!month) continue

    const amountRaw = (cols[colAmount] ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")
    const amount = parseFloat(amountRaw) || 0
    if (amount <= 0) continue // Ignorer les lignes à 0 ou négatives

    let net = amount
    if (colNet >= 0 && cols[colNet]) {
      const netRaw = (cols[colNet] ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")
      net = parseFloat(netRaw) || amount
    } else if (colFee >= 0 && cols[colFee]) {
      const feeRaw = (cols[colFee] ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")
      const fee = parseFloat(feeRaw) || 0
      net = amount - fee
    }

    if (!byMonth[month]) byMonth[month] = { month, cabrut: 0, canet: 0, transactions: 0 }
    byMonth[month].cabrut += amount
    byMonth[month].canet += net
    byMonth[month].transactions += 1
  }

  return Object.values(byMonth)
    .map(m => ({
      ...m,
      cabrut: Math.round(m.cabrut * 100) / 100,
      canet: Math.round(m.canet * 100) / 100,
    }))
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

    let contentBlock
    if (mimetype === "application/pdf") {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    } else if (CLAUDE_SUPPORTED_IMAGES.has(mimetype)) {
      contentBlock = {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: buffer.toString("base64") },
      }
    } else {
      return res.status(415).json({
        ok: false,
        error: `Format "${ext}" non reconnu. Envoyez un PDF, une image ou un export CSV Square.`,
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

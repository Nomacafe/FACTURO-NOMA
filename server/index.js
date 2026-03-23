import "dotenv/config"
import express from "express"
import cors from "cors"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
import bcryptPkg from "bcryptjs"
const bcrypt = bcryptPkg
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const jwt = require("jsonwebtoken")
import squarePkg from "square"

const { SquareClient, SquareEnvironment } = squarePkg

const app = express()
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

// ─── Helper : agrège les paiements par mois ──────────────────────────────────

function groupByMonth(payments) {
  const map = {}

  for (const p of payments) {
    if (!p.createdAt) continue
    if (p.status !== "COMPLETED") continue

    const month = new Date(p.createdAt).toISOString().slice(0, 7)

    if (!map[month]) {
      map[month] = { month, totalTTC: 0, tvaCollectee: 0, transactions: 0 }
    }

    const gross = Number(p.amountMoney?.amount ?? 0) / 100
    const refunded = Number(p.refundedMoney?.amount ?? 0) / 100
    const ttc = gross - refunded
    const tva = Math.round((ttc - ttc / 1.1) * 100) / 100

    map[month].totalTTC += ttc
    map[month].tvaCollectee += tva
    map[month].transactions += 1
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

    let payments = []
    let page = await square.payments.list({
      beginTime: startDate,
      endTime: endDate,
      locationId: LOCATION_ID,
      sortOrder: "ASC",
      limit: 100,
    })

    payments = payments.concat(page.data ?? [])

    while (page.response?.cursor) {
      page = await page.getNextPage()
      payments = payments.concat(page.data ?? [])
    }

    const monthly = groupByMonth(payments)
    res.json({ ok: true, months: monthly, total: payments.length })
  } catch (err) {
    console.error("Square API error:", err)
    res.status(500).json({ ok: false, error: err.message ?? "Erreur Square" })
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

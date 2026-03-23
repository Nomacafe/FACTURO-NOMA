// En développement : appelle localhost:3001
// En production (Railway) : appelle la même origine (chemin relatif)
export const API_BASE = import.meta.env.PROD ? "" : "http://localhost:3001"

import { prisma } from '../db.js'
import { hashPassword, comparePassword, signToken } from '../auth.js'
import { claimDemoPack } from './demo.js'

// ─── Registrar novo usuário ───────────────────────────────────────────────────
// claimToken é opcional: se presente, o pack demo é transferido automaticamente
export async function registerUser({ email, username, password, claimToken }) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (existing) return { error: 'email_or_username_taken' }

  const user = await prisma.user.create({
    data: { email, username, passwordHash: await hashPassword(password) },
  })

  // Reivindica o pack demo silenciosamente — erro não impede o cadastro
  if (claimToken) {
    await claimDemoPack(user.id, claimToken).catch(err =>
      console.warn('[auth] claimDemoPack falhou:', err.message),
    )
  }

  return { token: signToken(user), user: { id: user.id, email, username } }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return { error: 'invalid_credentials' }

  const ok = await comparePassword(password, user.passwordHash)
  if (!ok) return { error: 'invalid_credentials' }

  return {
    token: signToken(user),
    user: { id: user.id, email: user.email, username: user.username, albumCompleted: user.albumCompleted },
  }
}

// ─── Buscar usuário autenticado ───────────────────────────────────────────────
export async function getMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
    albumCompleted: user.albumCompleted,
    goldShareBonusClaimed: user.goldShareBonusClaimed,
  }
}

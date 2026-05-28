/**
 * Dev only — apaga todos os PackOpens para poder abrir packs de novo.
 * Uso: node scripts/reset-packs.js
 *      node scripts/reset-packs.js seu@email.com   (só um usuário)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const emailFilter = process.argv[2]

async function main() {
  let where = {}

  if (emailFilter) {
    const user = await prisma.user.findUnique({ where: { email: emailFilter } })
    if (!user) { console.log('Usuário não encontrado:', emailFilter); return }
    where = { userId: user.id }
    console.log(`Resetando packs de ${user.email} (${user.username})...`)
  } else {
    console.log('Resetando packs de TODOS os usuários...')
  }

  const { count } = await prisma.packOpen.deleteMany({ where })
  console.log(`✓ ${count} PackOpen(s) apagado(s). Pode abrir packs de novo.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1) })

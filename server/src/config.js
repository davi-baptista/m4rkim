import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: Number(process.env.PORT ?? 8787),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  baseDailyPacks: 2,
  goldCopiesPerSlot: 5,
  silverCopiesPerSlot: 10,
}

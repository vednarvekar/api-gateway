import { buildApp } from './app.js'
import { config } from './utils/config.js'
import { db } from './db/client.js'

const app = await buildApp()

const start = async () => {
  try {
    await db.execute('SELECT 1;');
    await app.listen({ port: config.port })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
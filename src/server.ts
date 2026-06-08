import { buildApp } from './app.js'
import { config } from './utils/config.js'

const app = buildApp()

const start = async () => {
  try {
    await app.listen({ port: config.port })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
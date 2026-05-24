import { Hono } from 'hono'
import { logger } from 'hono/logger'
import auth from './routes/auth'
const app = new Hono()
app.use(logger())
app.get('/', (c) => {
  return c.text('Hello Hono!')
})
app.route('/auth', auth);

export default { 
  port: 3004, 
  fetch: app.fetch, 
} 

import Fastify from 'fastify'

// 1. Create the User Service (Port 4001)
const userService = Fastify()

userService.get('/user/profile', async (request) => {
  return {
    success: true,
    userId: request.headers['x-user-id'] || 'no-user-id-passed'
  }
})

userService.listen({ port: 4001 }, (err, address) => {
  if (err) {
    console.error("Failed to start User Service:", err)
  } else {
    console.log(`👤 User Mock Service online at ${address}`)
  }
})


// 2. Create the Admin Service (Port 4005)
const adminService = Fastify()

adminService.get('/admin/dashboard', async (request) => {
  return {
    success: true, 
    userId: request.headers['x-user-id'] || 'no-admin-id-passed'
  }
})

adminService.listen({ port: 4005 }, (err, address) => {
  if (err) {
    console.error("Failed to start Admin Service:", err)
  } else {
    console.log(`👑 Admin Mock Service online at ${address}`)
  }
})
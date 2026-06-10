### Autocannon testing cli
`autocannon \
  -c 100 \
  -d 10 \
  -H "Authorization: Bearer " \
  http://localhost:4004/user/profile`

## Turn of Fastify Logger & Console for maximum throughtput also set `maxRequests = 1000000`
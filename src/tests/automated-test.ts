import autocannon from 'autocannon'

const BASE_URL = 'http://localhost:4004'

// First login to get a token
async function getToken(): Promise<string> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@test.com', password: 'admin123' })
    })
    const data = await res.json() as { accessToken: string }
    return data.accessToken
}

async function runTest(label: string, options: autocannon.Options): Promise<autocannon.Result> {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Running: ${label}`)
    console.log(`${'─'.repeat(60)}`)

    return new Promise((resolve, reject) => {
        const instance = autocannon(options, (err, result) => {
            if (err) reject(err)
            else resolve(result)
        })
        autocannon.track(instance)
    })
}

function printSummary(label: string, result: autocannon.Result) {
    const total    = result.requests.total
    const errors   = result.errors + result.timeouts + (result['4xx'] ?? 0) + (result['5xx'] ?? 0)
    const success  = total - errors
    const passRate = ((success / total) * 100).toFixed(2)

    console.log(`\n📊 Summary — ${label}`)
    console.log(`  Total requests   : ${total}`)
    console.log(`  ✅ Passed        : ${success}`)
    console.log(`  ❌ Failed        : ${errors}`)
    console.log(`  Pass rate        : ${passRate}%`)
    console.log(`  RPS (avg)        : ${result.requests.average}`)
    console.log(`  Latency avg      : ${result.latency.average}ms`)
    console.log(`  Latency p99      : ${result.latency.p99}ms`)
    console.log(`  Latency max      : ${result.latency.max}ms`)
    console.log(`  Duration         : ${result.duration}s`)
}

async function main() {
    const token = await getToken()
    console.log('✅ Token acquired\n')

    const results: { label: string; result: autocannon.Result }[] = []

    // Test 1: Low concurrency baseline
    const r1 = await runTest('Baseline — 10 concurrent users, 10s', {
        url: `${BASE_URL}/user/profile`,
        connections: 10,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` }
    })
    results.push({ label: 'Baseline (10 users)', result: r1 })

    // Test 2: Medium concurrency
    const r2 = await runTest('Medium — 50 concurrent users, 10s', {
        url: `${BASE_URL}/user/profile`,
        connections: 50,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` }
    })
    results.push({ label: 'Medium (50 users)', result: r2 })

    // Test 3: High concurrency
    const r3 = await runTest('High — 100 concurrent users, 10s', {
        url: `${BASE_URL}/user/profile`,
        connections: 100,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` }
    })
    results.push({ label: 'High (100 users)', result: r3 })

    // Test 4: Stress — find the breaking point
    const r4 = await runTest('Stress — 250 concurrent users, 10s', {
        url: `${BASE_URL}/user/profile`,
        connections: 250,
        duration: 10,
        headers: { Authorization: `Bearer ${token}` }
    })
    results.push({ label: 'Stress (250 users)', result: r4 })

    // Test 5: Cache performance (same URL = Redis hits)
    const r5 = await runTest('Cache — 100 concurrent, cached route, 10s', {
        url: `${BASE_URL}/billing/invoices`,
        connections: 100,
        duration: 10,
        headers: { 'x-api-key': 'test-api-key-billing-service' }
    })
    results.push({ label: 'Cache hit (100 users)', result: r5 })

// Test 6: Rate limit behavior
// Tests 1-5: throughput tests (run with RATE_LIMIT_MAX=1000000)
// Test 6: rate limit test — run separately with normal config

// Change test 6 to be honest about what it's testing
const r6 = await runTest('Rate limit — 10 users, 10s (max 100 req/min)', {
    url: `${BASE_URL}/user/profile`,
    connections: 10,
    duration: 15,
    headers: { Authorization: `Bearer ${token}` }
})
    results.push({ label: 'Rate limit (100 users, 30s)', result: r6 })

    // Final summary table
    console.log(`\n${'═'.repeat(60)}`)
    console.log('FULL REPORT')
    console.log(`${'═'.repeat(60)}`)
    for (const { label, result } of results) {
        printSummary(label, result)
    }
}

main().catch(console.error)
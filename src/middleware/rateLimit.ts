interface BucketEntry {
    count: number,
    resetAt: number
}

const bucket = new Map<string, BucketEntry>()

export function checkRateLimit (
    key: string,
    maxRquests: number,
    windowMs: number
): {allowed: boolean; remaining: number; resetAt: number } {

    const now = Date.now()
    const entry = bucket.get(key)

    if(!entry || now > entry.resetAt) {
        bucket.set(key, {count: 1, resetAt: now + windowMs})
        return { allowed: true, remaining: maxRquests - 1, resetAt: now + windowMs}
    }
    
    console.log({
        key,
        count: entry?.count,
        maxRequests: maxRquests
    })

    if(entry.count >= maxRquests){
        return {allowed: false, remaining: 0, resetAt: entry.resetAt}
    }

    entry.count++
    return { allowed: true, remaining: maxRquests - entry.count, resetAt: entry.resetAt }
}

setInterval(() => {
    const now = Date.now()
    for(const [key, entry] of bucket.entries()){
        if(now > entry.resetAt) bucket.delete(key)
    }
}, 1 * 60_000)
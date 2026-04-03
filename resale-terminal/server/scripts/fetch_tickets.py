#!/usr/bin/env python3
"""
Multi-platform ticket data fetcher using TicketsData API.
Called by Node.js via child_process. Reads JSON input from stdin, writes JSON to stdout.

Input JSON: { "platforms": [...], "email": "...", "password": "..." }
Each platform entry: { "platform": "ticketmaster", "event_url": "..." }
"""
import sys
import json
import asyncio

async def fetch_tickets(config):
    try:
        from ticketsdata_client import TicketsDataClient
    except ImportError:
        return {"error": "ticketsdata-client not installed. Run: pip install ticketsdata-client"}

    email = config.get("email", "")
    password = config.get("password", "")
    platforms = config.get("platforms", [])

    if not email or not password:
        return {"error": "TICKETSDATA_EMAIL and TICKETSDATA_PASSWORD required"}

    if not platforms:
        return {"error": "No platform jobs provided"}

    client = TicketsDataClient(
        username=email,
        password=password,
        concurrency=5,
        timeout=30,
        include_metadata=True,
    )

    try:
        results = await client.fetch_many(platforms)
        # Aggregate the data
        aggregated = {
            "platforms": {},
            "totalListings": 0,
            "lowestPrice": None,
            "highestPrice": None,
            "pricesByPlatform": {},
        }

        for r in results:
            platform = r.get("platform", "unknown")
            listings = r.get("listings", r.get("tickets", r.get("offers", [])))

            if not isinstance(listings, list):
                listings = []

            count = len(listings)
            prices = []
            for listing in listings:
                price = listing.get("price", listing.get("amount", listing.get("total_price")))
                if price and isinstance(price, (int, float)):
                    prices.append(float(price))

            lowest = min(prices) if prices else None
            highest = max(prices) if prices else None
            avg = sum(prices) / len(prices) if prices else None

            aggregated["platforms"][platform] = {
                "listingCount": count,
                "lowestPrice": lowest,
                "highestPrice": highest,
                "avgPrice": round(avg, 2) if avg else None,
                "raw": r,  # Include raw data for debugging
            }

            aggregated["totalListings"] += count
            if lowest and (aggregated["lowestPrice"] is None or lowest < aggregated["lowestPrice"]):
                aggregated["lowestPrice"] = lowest
            if highest and (aggregated["highestPrice"] is None or highest > aggregated["highestPrice"]):
                aggregated["highestPrice"] = highest

            aggregated["pricesByPlatform"][platform] = {
                "low": lowest,
                "high": highest,
                "avg": round(avg, 2) if avg else None,
                "count": count,
            }

        return aggregated

    except Exception as e:
        return {"error": str(e)}
    finally:
        await client.close()


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)

    result = asyncio.run(fetch_tickets(input_data))
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

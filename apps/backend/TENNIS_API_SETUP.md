# Tennis API Integration Setup

## Overview
Integration with Tennis API (tennis-api.com) for fetching current and recent match data.

## Prerequisites

1. **Get Tennis API Key**:
   - Sign up at https://tennis-api.com
   - Get FREE tier API key
   - Add to `.env` file

2. **Environment Variables**:
   ```bash
   cp .env.example .env
   # Add your TENNIS_API_KEY
   ```

## Data Strategy

### Upcoming Matches
- Fetch daily: `GET /tennis/v2/{atp|wta}/fixtures`
- Store in database as SCHEDULED
- Used for prediction generation

### Recent Results
- Fetch last 7 days: `GET /tennis/v2/{atp|wta}/results/{startDate}/{endDate}`
- Store in database as COMPLETED
- Used as historical evidence for predictions

### Data Retention
- Keep only last 30 days of historical data
- Older data can be purged to maintain relevance
- App uses only very recent data for predictions

## API Services

### `fetchUpcomingFixtures(type, date?)`
- Fetches upcoming ATP or WTA fixtures
- Optional date parameter for specific day
- Returns array of scheduled matches

### `fetchResults(type, date)`
- Fetches results for specific date
- Returns completed matches with scores

### `fetchResultsRange(type, startDate, endDate)`
- Fetches results for date range
- Used for importing last 7 days

### `fetchTournamentFixtures(type, tournamentId)`
- Fetches fixtures for specific tournament
- Useful for tournament-specific views

## Worker Functions

### `ingestUpcomingMatches()`
- Fetches today's ATP and WTA fixtures
- Upserts matches to database
- Creates players if they don't exist

### `ingestRecentResults()`
- Fetches last 7 days of results
- Updates match status to COMPLETED
- Records winners

### `runFullIngestion()`
- Runs both upcoming and recent ingestion
- Should be scheduled daily (cron job)

## Database Schema

### Player
- id, name, arabicMeaning, abjadValue
- Upserted by name (unique)

### Match
- id, player1Id, player2Id, tournament, city, country
- scheduledTime, actualStartTime, status, winnerId
- Upserted by matchId (unique)

## Scheduling

Run ingestion workers daily:
```bash
# Using cron (example)
0 0 * * * cd /path/to/backend && npm run ingest
```

## Error Handling

- API errors are logged
- Failed fixtures are skipped
- Database upserts handle duplicates gracefully

## Next Steps

1. Add Tennis API key to `.env`
2. Test API endpoints manually
3. Run ingestion worker
4. Verify data in database
5. Set up scheduled cron job

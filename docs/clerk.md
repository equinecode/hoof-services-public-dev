# Clerk Authentication

Clerk authenticates requests from the frontend. This API uses [`@clerk/express`](https://clerk.com/docs/reference/express/overview) to validate session tokens and attach auth state to each request.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | Yes | Publishable key from the Clerk Dashboard (`pk_...`) |
| `CLERK_SECRET_KEY` | Yes | Secret key from the Clerk Dashboard (`sk_...`) |
| `CLERK_AUTHORIZED_PARTIES` | Recommended | Comma-separated list of allowed frontend origins |

Example:

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_AUTHORIZED_PARTIES=http://localhost:5173,https://app.example.com
```

Get keys from [Clerk Dashboard → API keys](https://dashboard.clerk.com/last-active?path=api-keys).

`CLERK_AUTHORIZED_PARTIES` protects against subdomain cookie-leaking attacks by verifying the token's authorized party claim against your frontend origin(s). Set this in production.

## How it works

1. `clerkMiddleware()` runs on every request (registered first in `src/app.ts`).
2. It reads the session token from the `Authorization: Bearer <token>` header or session cookies.
3. Auth state is attached to the request and accessible via `getAuth(req)`.
4. Protected routes use the `requireAuth` middleware, which returns `401` JSON instead of redirecting to a sign-in page.

## Routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/health` | Public | Health check |
| `GET /api/me` | Protected | Returns the authenticated user's Clerk session info |

## Protecting a route

Add `requireAuth` when registering a router in `src/routes/index.ts`:

```typescript
import { requireAuth } from "../middleware/clerk";
import { listingsRouter } from "./listings";

apiRouter.use("/listings", requireAuth, listingsRouter);
```

Inside a route handler, read auth state with `getAuth`:

```typescript
import { getAuth } from "../middleware/clerk";

listingsRouter.get("/", (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId;

  // Use userId to scope data to the authenticated user
  res.json({ userId });
});
```

## Frontend integration

The frontend must send the Clerk session token on each API request.

### React (Clerk React SDK)

```typescript
import { useAuth } from "@clerk/react";

const { getToken } = useAuth();

const token = await getToken();

const response = await fetch("http://localhost:3000/api/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Next.js (Clerk Next.js SDK)

```typescript
import { auth } from "@clerk/nextjs/server";

const { getToken } = await auth();
const token = await getToken();

await fetch("http://localhost:3000/api/me", {
  headers: { Authorization: `Bearer ${token}` },
});
```

## Authorization checks

Beyond authentication, Clerk supports permission and role checks via `auth.has()`:

```typescript
const auth = getAuth(req);

if (!auth.isAuthenticated) {
  res.status(401).json({ error: "Unauthorized" });
  return;
}

if (!auth.has({ permission: "org:admin:manage_listings" })) {
  res.status(403).json({ error: "Forbidden" });
  return;
}
```

See [Clerk authorization checks](https://clerk.com/docs/guides/secure/authorization-checks) for more.

## Source files

- `src/middleware/clerk.ts` — middleware factory, `requireAuth`, `getAuth` re-export
- `src/app.ts` — registers `clerkMiddleware` before other middleware
- `src/routes/me.ts` — example protected route

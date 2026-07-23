# Phase 8 --- Frontend UI & Marketing

## Objective

Build the complete **Norien frontend** using the existing backend APIs.

**Do NOT modify the backend.** Do NOT create mock data. Every page must
consume live data from the existing API.

------------------------------------------------------------------------

# Design System

-   Style: Premium, minimal, developer-first.
-   Theme: Warm cream + brown.
-   Background: `#F6F2EA`
-   Cards: `#FFFFFF`
-   Border: `#DDD2C2`
-   Primary text: `#2E261F`
-   Secondary text: `#6C6257`
-   Accent: `#7A5A3A`

No glassmorphism. No neon. No heavy gradients. Whitespace is important.

------------------------------------------------------------------------

# Global Layout

All authenticated pages share:

-   Left sidebar
-   Top navigation
-   Content area
-   Responsive mobile layout
-   Loading skeletons
-   Empty states
-   Error states

------------------------------------------------------------------------

# Public Marketing Routes

-   `/`
-   `/docs`
-   `/pricing`
-   `/blog`
-   `/changelog`
-   `/about`
-   `/contact`
-   `/privacy`
-   `/terms`
-   `/login`
-   `/signup`

The landing page is a **marketing page**, not the application dashboard.

Sections:

1.  Hero
2.  Features
3.  How it Works
4.  CLI
5.  Registry
6.  Runtime
7.  Marketplace
8.  API
9.  Documentation CTA
10. Footer

------------------------------------------------------------------------

# Application Routes

## Dashboard

-   `/app`

Widgets:

-   Trending Tokens
-   New Launches
-   Highest Volume
-   Biggest Gainers
-   Latest Projects
-   Latest Registry
-   Latest Tools
-   Network Status

------------------------------------------------------------------------

## Markets

-   `/app/markets`

------------------------------------------------------------------------

## Search

-   `/app/search`

Global search.

------------------------------------------------------------------------

## Tokens

-   `/app/tokens`
-   `/app/token/[address]`

------------------------------------------------------------------------

## Wallet Explorer

-   `/app/wallet/[address]`

------------------------------------------------------------------------

## Contract Explorer

-   `/app/contract/[address]`

------------------------------------------------------------------------

## Projects

-   `/app/projects`
-   `/app/project/[slug]`

------------------------------------------------------------------------

## Registry

-   `/app/registry`
-   `/app/registry/[slug]`

------------------------------------------------------------------------

## Tool Marketplace

-   `/app/tools`
-   `/app/tools/[slug]`

------------------------------------------------------------------------

## Runtime

-   `/app/runtime`

------------------------------------------------------------------------

## Publish

-   `/app/publish`

------------------------------------------------------------------------

## API Keys

-   `/app/api-keys`

------------------------------------------------------------------------

## Profile

-   `/app/profile`

------------------------------------------------------------------------

## Settings

-   `/app/settings`

------------------------------------------------------------------------

# Sidebar

-   Dashboard
-   Markets
-   Search
-   Projects
-   Registry
-   Tools
-   Runtime
-   Publish
-   API Keys
-   Settings

------------------------------------------------------------------------

# Data Rules

-   Never use mock data.
-   Connect every page to live backend APIs.
-   Reuse API clients.
-   Strong TypeScript typing.
-   Proper loading and error handling.

------------------------------------------------------------------------

# Authentication

Prepare UI for:

-   GitHub OAuth
-   Google OAuth

Authentication will use Supabase Auth later.

------------------------------------------------------------------------

# Technical Requirements

-   Next.js App Router
-   TypeScript
-   Tailwind CSS
-   Responsive
-   Accessible
-   Clean component architecture

------------------------------------------------------------------------

# Deliverables

-   Complete marketing website.
-   Complete application UI.
-   Every route implemented.
-   Responsive desktop/mobile.
-   Production-quality frontend ready to connect to Supabase Auth later.

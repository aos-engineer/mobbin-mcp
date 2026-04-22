# Implementation Ideas

These are concrete next extensions enabled by the current architecture.

1. Item-level collection sync
Discover and implement the Mobbin endpoints needed to import actual collection contents instead of collection metadata only.

2. Design-system extraction
Mine repeated patterns, colors, and elements from captures to seed tokens and reusable components.

3. Session timelines
Track how a feature evolved across multiple mobbing sessions, including open and rejected decisions.

4. Evaluation datasets
Generate stable QA sets from captured artifacts for testing agent reasoning over design references.

5. Search ranking improvements
Upgrade similarity from pHash plus keyword scoring to embeddings or hybrid ranking.

6. Shared HTTP team store
Add optional remote storage so teams can share captures without relying on a shared filesystem path.

7. Shipped-UI capture automation
Capture screenshots from local or staging environments and feed them into intended-vs-actual review workflows automatically.

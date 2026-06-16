<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:serena-agent-rules -->
# Serena memory is enabled for token-efficient project context

When Serena is available, activate this project from the current working directory and read `mem:core` before broad code exploration. Follow its memory references for the specific domain you are touching instead of re-scanning the whole repository.

Keep Serena memories short and durable. Update them only for stable project conventions, architecture decisions, commands, or gotchas that future agents would otherwise rediscover.
<!-- END:serena-agent-rules -->

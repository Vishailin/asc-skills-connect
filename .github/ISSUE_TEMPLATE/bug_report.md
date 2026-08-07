---
name: Bug report
about: Something in the API or a dashboard isn't behaving correctly
title: ""
labels: bug
assignees: ""
---

**Which role/module?**
e.g. Employer dashboard, TSP pipeline, Admin console, Learner registration API

**What happened**
A clear description of the actual behavior.

**What you expected**
What should have happened instead.

**Steps to reproduce**
1. ...
2. ...
3. ...

For a backend bug, the exact request is the most useful thing you can
include — e.g.:
```bash
curl -s http://localhost:4000/api/... -H "Authorization: Bearer ..." -d '{...}'
```

**Environment**
- Ran via `bash verify.sh` on a fresh DB? (yes/no)
- Node version:
- PostgreSQL version:

**Additional context**
Anything else worth knowing (screenshots, console errors, etc).

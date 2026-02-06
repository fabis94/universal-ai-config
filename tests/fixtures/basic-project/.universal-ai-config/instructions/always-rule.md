---
description: Always applied coding standards
alwaysApply: true
---
Follow the project's coding standards at all times.
<% if (target === 'claude') { -%>
Use the Read tool to check existing patterns before creating new code.
<% } else { -%>
Check existing patterns before creating new code.
<% } -%>

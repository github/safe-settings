module.exports = `* Run on: \`<%= new Date() %>\`

* Number of repos considered: \`<%= Object.keys(it.reposProcessed).length %>\`

---

## Changes
<% if (Object.keys(it.changes).length === 0) { %>

No changes to apply.
<% } else { %>
<% Object.keys(it.changes).forEach(function(plugin) { %>

<details>
<summary><%= plugin %> settings</summary>

| Repo | Additions | Deletions | Modifications |
| --- | --- | --- | --- |
<% Object.keys(it.changes[plugin]).forEach(function(repo) { %><% it.changes[plugin][repo].forEach(function(action) { %><% if (typeof action === 'string') { %>| <%= repo %> | <%= action %> | | |
<% } else { %>| <%= repo %> | <%- action.additions != null ? JSON.stringify(action.additions, null, 2).split('|').join('&#124;') : '' %> | <%- action.deletions != null ? JSON.stringify(action.deletions, null, 2).split('|').join('&#124;') : '' %> | <%- action.modifications != null ? JSON.stringify(action.modifications, null, 2).split('|').join('&#124;') : '' %> |
<% } %><% }) %><% }) %>

</details>
<% }) %>
<% } %>

---

## Errors
<% if (Object.keys(it.errors).length === 0) { %>

None
<% } else { %>

<details>
<summary>Errors by repo</summary>

<% Object.keys(it.errors).forEach(function(repo) { %>
**<%= repo %>**

<% it.errors[repo].forEach(function(err) { %>* <%= err.msg %>
<% }) %>
<% }) %>

</details>
<% } %>`

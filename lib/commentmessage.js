module.exports = `* Run on: \`<%= new Date() %>\`

* Number of repos considered: \`<%= Object.keys(it.reposProcessed).length %>\`
* Number of repos affected: \`<%= it.reposAffected || 0 %>\`

---

## Changes
<% if (!it.changeSections || it.changeSections.length === 0) { %>

No changes to apply.
<% } else { %>

<%~ it.checkRunDetails %>
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

module.exports = `* Run on: \` <%= new Date() %> \`

* Number of repos that were considered: \`<%= Object.keys(it.reposProcessed).length %> \`

### Breakdown of changes
| Repo <% Object.keys(it.changes).forEach(plugin => { %> | <%= plugin %> settings  <% }) %> |
| -- <% Object.keys(it.changes).forEach(plugin => { -%>  | --  <% }) %>
| 
<% Object.keys(it.reposProcessed).forEach( repo => { -%>
| <%= repo -%>
  <%- Object.keys(it.changes).forEach(plugin => { -%>
    <%_ if (it.changes[plugin][repo]) { -%> |  :hand:  <% } else { %>  |  :grey_exclamation:  <% } -%>
  <%_ }) -%> |
<% }) -%>

:hand: -> Changes to be applied to the GitHub repository.
:grey_exclamation: -> nothing to be changed in that particular GitHub repository.

### Breakdown of errors

<% if (Object.keys(it.errors).length === 0) { %>
\`None\`
<% } else { %>
  <% Object.keys(it.errors).forEach(repo => { %>
    <%_= repo %>: 
    <% it.errors[repo].forEach(plugin => { %>
      * <%= plugin.msg %>
    <% }) %>

  <% }) %>
<% } %>`

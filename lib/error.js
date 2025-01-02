module.exports = `Run on: \`<%= new Date().toISOString() %>\`

#### Breakdown of Errors
| Owner| Repo | Plugin | Error 
| --- | --- | --- | --- 
<% it.forEach( error => { -%>
<%= error.owner %> | <%= error.repo %> | <%= error.plugin %> | <%= error.msg %>

<% }) -%>


`

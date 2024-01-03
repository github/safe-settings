# safe-settings

A Helm chart for Kubernetes

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| autoscaling.enabled | bool | `false` |  |
| autoscaling.maxReplicas | int | `10` |  |
| autoscaling.minReplicas | int | `2` |  |
| autoscaling.targetCPUUtilizationPercentage | int | `80` |  |
| deploymentConfig.configvalidators[0].error | string | `"`Admin cannot be assigned to collaborators`\n"` |  |
| deploymentConfig.configvalidators[0].plugin | string | `"collaborators"` |  |
| deploymentConfig.configvalidators[0].script | string | `"console.log(`baseConfig ${JSON.stringify(baseconfig)}`)\nreturn baseconfig.permission != 'admin'\n"` |  |
| deploymentConfig.overridevalidators[0].error | string | `"`Branch protection required_approving_review_count cannot be overidden to a lower value`\n"` |  |
| deploymentConfig.overridevalidators[0].plugin | string | `"branches"` |  |
| deploymentConfig.overridevalidators[0].script | string | `"console.log(`baseConfig ${JSON.stringify(baseconfig)}`)\nconsole.log(`overrideConfig ${JSON.stringify(overrideconfig)}`)\nif (baseconfig.protection.required_pull_request_reviews.required_approving_review_count && overrideconfig.protection.required_pull_request_reviews.required_approving_review_count ) {\n  return overrideconfig.protection.required_pull_request_reviews.required_approving_review_count >= baseconfig.protection.required_pull_request_reviews.required_approving_review_count\n}\nreturn true\n"` |  |
| deploymentConfig.overridevalidators[1].error | string | `"Some error\n"` |  |
| deploymentConfig.overridevalidators[1].plugin | string | `"labels"` |  |
| deploymentConfig.overridevalidators[1].script | string | `"return true\n"` |  |
| deploymentConfig.restrictedRepos.exclude[0] | string | `"^admin$"` |  |
| deploymentConfig.restrictedRepos.exclude[1] | string | `"^\\.github$"` |  |
| deploymentConfig.restrictedRepos.exclude[2] | string | `"^safe-settings$"` |  |
| deploymentConfig.restrictedRepos.exclude[3] | string | `".*-test"` |  |
| deploymentConfig.restrictedRepos.include[0] | string | `"^test$"` |  |
| env | list | `[]` |  |
| envFrom | list | `[]` |  |
| extraObjects | list | `[]` | Add dynamic manifests via values. Example: extraObjects: - kind: ConfigMap   apiVersion: v1   metadata:     name: extra-cm-{{ .Release.Name }}   data: |     extra.yml: "does-my-install-need-extra-info: true" |
| fullnameOverride | string | `""` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"ghcr.io/github/safe-settings"` |  |
| image.tag | string | `""` |  |
| imagePullSecrets | list | `[]` |  |
| ingress.annotations | object | `{}` |  |
| ingress.className | string | `""` |  |
| ingress.enabled | bool | `false` |  |
| ingress.hosts[0].host | string | `"chart-example.local"` |  |
| ingress.hosts[0].paths[0].path | string | `"/"` |  |
| ingress.hosts[0].paths[0].pathType | string | `"ImplementationSpecific"` |  |
| ingress.tls | list | `[]` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| podAnnotations | object | `{}` |  |
| podSecurityContext | object | `{}` |  |
| replicaCount | int | `2` |  |
| resources | object | `{}` |  |
| securityContext.allowPrivilegeEscalation | bool | `false` |  |
| securityContext.capabilities.drop[0] | string | `"ALL"` |  |
| securityContext.privileged | bool | `false` |  |
| securityContext.readOnlyRootFilesystem | bool | `true` |  |
| securityContext.runAsNonRoot | bool | `true` |  |
| securityContext.runAsUser | int | `1000` |  |
| service.port | int | `80` |  |
| service.type | string | `"ClusterIP"` |  |
| serviceAccount.annotations | object | `{}` |  |
| serviceAccount.automountServiceAccountToken | bool | `false` |  |
| serviceAccount.create | bool | `true` |  |
| serviceAccount.name | string | `""` |  |
| tolerations | list | `[]` |  |
| volumeMounts | list | `[]` |  |
| volumes | list | `[]` |  |


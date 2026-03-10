# Terraform

Environments:
- `envs/dev`
- `envs/staging`
- `envs/prod`

Modules:
- `modules/networking`
- `modules/data`
- `modules/compute`
- `modules/observability` (CloudWatch dashboard + ECS CPU/memory/running-task alarms)
- `modules/edge`

## Commands

```bash
terraform -chdir=infra/terraform/envs/dev init
terraform -chdir=infra/terraform/envs/dev plan
terraform -chdir=infra/terraform/envs/dev apply
```

locals {
  name_prefix = "gazelle-dev"

  services = {
    gateway = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/gateway:${var.image_tag}"
      cpu            = 256
      memory         = 512
      container_port = 8080
    }
    identity = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/identity:${var.image_tag}"
      cpu            = 256
      memory         = 512
      container_port = 3000
    }
    catalog = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/catalog:${var.image_tag}"
      cpu            = 256
      memory         = 512
      container_port = 3000
    }
    orders = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/orders:${var.image_tag}"
      cpu            = 512
      memory         = 1024
      container_port = 3000
    }
    payments = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/payments:${var.image_tag}"
      cpu            = 512
      memory         = 1024
      container_port = 3000
    }
    loyalty = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/loyalty:${var.image_tag}"
      cpu            = 256
      memory         = 512
      container_port = 3000
    }
    notifications = {
      image          = "ghcr.io/gazelledev/gazellemobileplatform/notifications:${var.image_tag}"
      cpu            = 256
      memory         = 512
      container_port = 3000
    }
  }
}

module "networking" {
  source             = "../../modules/networking"
  name_prefix        = local.name_prefix
  availability_zones = var.availability_zones
}

module "data" {
  source             = "../../modules/data"
  name_prefix        = local.name_prefix
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_password        = var.db_password
}

module "compute" {
  source                     = "../../modules/compute"
  name_prefix                = local.name_prefix
  vpc_id                     = module.networking.vpc_id
  private_subnet_ids         = module.networking.private_subnet_ids
  service_security_group_ids = [module.data.data_security_group_id]
  services                   = local.services
  task_execution_role_arn    = var.task_execution_role_arn
  task_role_arn              = var.task_role_arn
}

module "observability" {
  source        = "../../modules/observability"
  name_prefix   = local.name_prefix
  cluster_name  = module.compute.cluster_name
  service_names = module.compute.service_names
}

module "edge" {
  source            = "../../modules/edge"
  name_prefix       = local.name_prefix
  create_dns_record = var.create_dns_record
  zone_id           = var.zone_id
  alb_dns_name      = var.alb_dns_name
  alb_zone_id       = var.alb_zone_id
}

variable "name_prefix" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "service_names" {
  type = list(string)
}

variable "alarm_actions" {
  type    = list(string)
  default = []
}

variable "ok_actions" {
  type    = list(string)
  default = []
}

variable "cpu_utilization_threshold" {
  type    = number
  default = 80
}

variable "memory_utilization_threshold" {
  type    = number
  default = 80
}

variable "minimum_running_task_count" {
  type    = number
  default = 1
}

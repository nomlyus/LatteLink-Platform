resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "${var.name_prefix}-platform"
  dashboard_body = jsonencode({
    widgets = []
  })
}

locals {
  service_names = toset(var.service_names)
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  for_each            = local.service_names
  alarm_name          = "${var.name_prefix}-${each.value}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = var.cpu_utilization_threshold
  alarm_description   = "High CPU for ${each.value}"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.ok_actions

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  for_each            = local.service_names
  alarm_name          = "${var.name_prefix}-${each.value}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = var.memory_utilization_threshold
  alarm_description   = "High memory utilization for ${each.value}"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.ok_actions

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "service_unhealthy" {
  for_each            = local.service_names
  alarm_name          = "${var.name_prefix}-${each.value}-running-task-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Minimum"
  threshold           = var.minimum_running_task_count
  alarm_description   = "Running task count dropped below expected minimum for ${each.value}"
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_actions
  ok_actions          = var.ok_actions

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = each.value
  }
}

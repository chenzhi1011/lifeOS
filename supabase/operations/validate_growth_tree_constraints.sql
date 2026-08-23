alter table goals validate constraint goals_goal_type_required;
alter table goals validate constraint goals_goal_type_check;
alter table goals validate constraint goals_ability_shape_check;
alter table goals validate constraint goals_completed_at_check;
alter table goals validate constraint goals_ability_fk;
alter table tasks validate constraint tasks_planned_metric_shape_check;

Feature: Task management
  As a user
  I want to manage my tasks
  So that I can keep track of things I need to do

  Scenario: Create a new task
    Given the user has no tasks
    When the user creates a task with title "Buy groceries"
    Then the task "Buy groceries" should be added to the task list

  Scenario: List all tasks
    Given the user has the following tasks:
      | title         |
      | Buy groceries |
      | Read a book   |
    When the user requests the list of tasks
    Then the user should see 2 tasks
    And the tasks should include "Buy groceries" and "Read a book"

  Scenario: Delete a task
    Given the user has the following tasks:
      | title         |
      | Buy groceries |
      | Read a book   |
    When the user deletes the task "Buy groceries"
    Then the task "Buy groceries" should no longer be in the task list
    And the task list should contain only "Read a book"

  Scenario: Delete one of several tasks with the same title
    Given the user has the following tasks:
      | title         |
      | Buy groceries |
      | Buy groceries |
    When the user deletes one of the "Buy groceries" tasks
    Then the task list should contain exactly 1 task titled "Buy groceries"

  Scenario: Delete the last task
    Given the user has the following tasks:
      | title         |
      | Buy groceries |
    When the user deletes the task "Buy groceries"
    Then the user should see 0 tasks
    And the empty state should be shown
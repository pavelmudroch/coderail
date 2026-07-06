---
name: code-simplify
description: Simplify and refactor code to improve readability and maintainability.
---
Read the code and identify following problems and fix them:

## 1. Duplication
**Problem**: Similar or duplicated code blocks repeated across the codebase.
**Solution**: Refactor to extract common logic into reusable functions or components.

## 2. Complexity
**Problem**: Functions or components that are too long, have too many responsibilities, or contain complex logic.
**Solution**: Break down into smaller, focused functions or components. Aim for single responsibility principle.

## 3. Nested conditions
**Problem**: Deeply nested if-else statements that are hard to read and understand.
**Solution**: Use early returns to reduce nesting. For multiple conditions, consider using switch statements.

## 4. Unclear naming
**Problem**: Variables, functions, or types with non-descriptive and not self explanatory names.
 - example: `data`, `handleClick`, `temp`, 'a'
 - only allowed are `i`, `j`, `k`, ... for loop indices.
**Solution**: Rename to more descriptive names that clearly indicate their purpose and usage.

**Important**: Must not change logic, behavior, public APIs, add features, or fix bugs. Only refactor code to improve readability and maintainability while keeping the same functionality. Always verify results with tests if available.

# String

Rules for string manipulation in TypeScript.

## Dynamic string construction

- prefer template literals

```typescript
const name = "Alice";
const greeting = `Hello, ${name}!`;
```

## Concatenation long multi-part strings

- prefer array join
- avoid excessive template literal interpolation, or + operations

**Do**
```typescript
const stringParts: string[] = [];
for (const item of items) {
  stringParts.push(`Item: ${item}\n`);
}
const result = stringParts.join("");
```

**Don't**
```typescript
let result = "";
for (const item of items) {
  result += `Item: ${item}\n`;
}
```

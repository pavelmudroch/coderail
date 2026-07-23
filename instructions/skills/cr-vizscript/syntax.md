## Types

- **Boolean** | True/False
- **Integer** | 32-bit signed int
- **Double** | 64-bit float
- **String** | Text
- **Vertex** | 3D point (x, y, z)
- **Matrix** | 4x4 matrix
- **Color** | RGBA (0.0-1.0 each)
- **Array[Type]** | Dynamic array
- **Structure** | Custom data structure

```vb
Structure User
    id As Integer
    name As String
End Structure
```

### Conversion

```vb
CInt(x), CDbl(x), CBool(x), CStr(x)
CType(x, type)
(type)x  ' C-style cast
```

## Syntax

### Operators

- `^` Exponentiation
- `-` Negation
- `*`, `/` Multiply, divide
- `Cross` Cross product (Vertex)
- `\` Integer division
- `Mod` Modulus
- `+` Add
- `-` subtract
- `&` String concatenation
- `<<`, `>>` Bit shift
- `==`, `<>`, `<`, `>`, `<=`, `>=` Comparison
- `Not` Logical/bitwise NOT
- `And` Logical/bitwise AND
- `Or` Logical/bitwise OR
- `Xor` Logical/bitwise XOR
- `+=`, `-=`, `*=`, `/=`, `\=`, `Mod=` Compound assignment

### Comments

Comment starts with a single quote `'`, ends with a new line.

### Variables

Case sensitive, declared with `dim` keyword and type.
Example:
```vb
dim myVariable as String
dim myNumber as Integer = 10
dim myArray as Array[Integer]
myArray.Push(1)
myArray.Push(2)
```

### Procedures

Procedure is callable block, decalred with `sub` keyword, can have parameters, does not return value.
```vb
sub MyProcedure(param1 as String, param2 as Integer)
    ' Procedure body
    exit sub ' early exit
    ' Procedure body
end sub
```

### Functions

Function is callable block, declared with `function` keyword, can have parameters, returns value.
```vb
function MyFunction(param1 as String, param2 as Integer) as String
    ' Function body
    MyFunction = "Result" ' assign return value, can be reassigned multiple times
    exit function ' early exit
    ' Function body
end function
```

### Conditional Statements

If else statements.
```vb
if condition then x = 1 ' one line
if condition then
    x = 1
else if otherCondition then
    x = 2
else
    x = 3
end if
```

Switch case statements.
```vb
select case variable
    case 1
        ' code for case 1
    case 2
        ' code for case 2
    case else
        ' code for default case
end select
```

### For Loops

```vb
for i = 0 to 10
    ' loop body
next i
```

For each loop.
```vb
for each item in array
    ' loop body
next item
```

early exit: `exit for`

### While Loops

Condition check at the beginning.
```vb
do while condition
    ' loop body
loop
```

Condition check at the end.
```vb
do
    ' loop body
loop while condition
```

early exit: `exit do`
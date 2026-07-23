Following functions and procedures are globally available.

## Logging

Println(value as Boolean/Integer/Double/String/Vertex)
Println(color as Integer, value as Boolean/Integer/Double/String/Vertex)

Color codes are 1 (blue), 2 (green), 4 (red), 8 (light).

Best practice is to always print string message formated as you want, instead of default print conversion.

## Math

For goniometric operations use `Acos(x as Double) as Double`, `Asin(x as Double) as Double`, `Atan(x as Double) as Double`, `Atan2(x as Double, y as Double) as Double` arctangent of x/y, `Cos(x as Double) as Double`, `Cosh(x as Double) as double`, `Sin(x as Double) as Double`, `Sinh(x as Double) as Double`, `Tan(x as Double) as Double`.

Other mathematical operations as absolute value, rounding, etc. `Abs(x as Double) as Double`, `Exp(x as Double) as Double`, `Log(x as Double) as Double`, `Sqrt(x as Double) as Double`, `Sqr(x as Double) as Double`, `Ceil(x as Double) as Double`, `Floor(x as Double) as Double`, `Fix(x as Double) as Double`, `Round(x as Double) as Double`, `Min(a as Integer, b as Integer) as Integer`, `Min(a as Double, b as Double) as Double`, `Max(a as Integer, b as Integer) as Integer`, `Max(a as Double, b as Double) as Double`, `Random() as Double`, `Random(i as Integer) as Integer`

`AngleBetweenVectors(v1 as Vertex, v2 as Vertex) as Double`, `Distance(v1 as Vertex, v2 as Vertex) as Double`, `Distance2(v1 as Vertex, v2 as Vertex) as Double`, `Determinant(a as Vertex, b as Vertex, c as Vertex) as Double`, `TriangleArea(a as Vertex, b as Vertex, c as Vertex) as Double`, `TriangleCenter(a as Vertex, b as Vertex, c as Vertex) as Vertex`, `LineLineIntersection(pointA1 as Vertex, pointA2 as Vertex, pointB1 as Vertex, pointB2 as Vertex) as Vertex` where line A is defined with pointA1 and pointA2, and line B by pointB1 and pointB2, `PlaneLineIntersection(planePopint as Vertex, planeNormal as Vertex, linePoint1 as Vertex, linePoint2 as Vertex) as Vertex`,

## Type conversions

Functions converting multiple types into selected type `CBool(v As Integer/Double/Uuid) As Boolean`, `CInt(v As Boolean/Double/String) As Integer`, `CDbl(v As Boolean/Integer/String) As Double`, `CStr(v As Boolean/Integer/Double/Uuid) As String`, `CVertex(v As Boolean/Integer/Double) As Vertex`, `CVertex(x As Double, y As Double, z As Double) As Vertex`, `CColor(r, g, b) As Color`, `CColor(r, g, b, a) As Color`, `CTrace(v As Integer) As Trace`, `CUuid(v As String) As Uuid`

String formatting `IntToString(value As Integer, width As Integer, addLeadingZeros As Boolean) As String` - convert integer to string with defined length padding left with ' ', if optional addLeadingZeros is `true` padding with '0', `DoubleToString(value As Double, precision As Integer, width As Integer) As String` - convert double value to string with specified precision, optional width parameter

Examples:
```vb
Println(DoubleToString(234.0123456789, 3))     ' outputs "234.012"
Println(DoubleToString(234.0123456789, 0))     ' outputs "234"
Println(DoubleToString(234.0123456789, 5))     ' outputs "234.01235"
Println(DoubleToString(234.0123456789, 3, 2))  ' outputs "234.012"
Println(DoubleToString(234.0123456789, 0, 5))  ' outputs "  234"
Println(DoubleToString(234.0123456789, 5, 5))  ' outputs "234.01235"
```

String functions `Len**(s As String) as Integer` length of string, `Asc**(s As String) as Integer` code of character, `Chr**(charCode As Integer) as String` character representation of code
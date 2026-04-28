# Multiple Draw.io Diagrams

Tests that two diagrams on the same page both render text correctly.
Previously, the second (and later) diagrams had empty/blank text boxes due to a clipPath ID collision.

## Diagram 1 — Simple Flow

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="a" value="Alpha" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="60" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="b" value="Beta" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="60" y="160" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e1" edge="1" source="a" target="b" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## Diagram 2 — Another Flow

This diagram must also show text (tests no clipPath ID collision with Diagram 1).

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="x" value="Gamma" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="60" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="y" value="Delta" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="60" y="160" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e2" edge="1" source="x" target="y" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## Diagram 3 — Third Diagram

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="p" value="Epsilon" style="ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
      <mxGeometry x="60" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

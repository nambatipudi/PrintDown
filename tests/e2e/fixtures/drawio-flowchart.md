# Draw.io Flowchart Test

Simple decision flowchart with rounded rectangles, ellipses, and edges.

```xml
<mxGraphModel dx="800" dy="600" grid="0" gridSize="10">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="start" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="160" y="40" width="80" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="step1" value="Process Data" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="130" y="160" width="140" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="decide" value="Is valid?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="130" y="280" width="140" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="yes" value="Save Result" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="40" y="430" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="no" value="Show Error" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="240" y="430" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="end" value="End" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
      <mxGeometry x="160" y="560" width="80" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="e1" edge="1" source="start" target="step1" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e2" edge="1" source="step1" target="decide" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e3" value="Yes" edge="1" source="decide" target="yes" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e4" value="No" edge="1" source="decide" target="no" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e5" edge="1" source="yes" target="end" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e6" edge="1" source="no" target="end" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

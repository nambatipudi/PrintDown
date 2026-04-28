# Draw.io Shapes Test

Tests various shape types: rectangle, rounded, ellipse, rhombus, cylinder, swimlane.

```xml
<mxGraphModel dx="1000" dy="700" grid="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="rect" value="Rectangle" style="whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="20" y="20" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="rounded" value="Rounded" style="rounded=1;whiteSpace=wrap;html=1;arcSize=30;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="180" y="20" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="ellipse" value="Ellipse" style="ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="340" y="10" width="120" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="rhombus" value="Diamond" style="rhombus;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="500" y="10" width="120" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="cylinder" value="Database" style="shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
      <mxGeometry x="660" y="10" width="100" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="swim" value="Swimlane" style="swimlane;startSize=30;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;" vertex="1" parent="1">
      <mxGeometry x="20" y="140" width="240" height="120" as="geometry"/>
    </mxCell>
    <mxCell id="child1" value="Step A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="swim">
      <mxGeometry x="20" y="40" width="80" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="child2" value="Step B" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="swim">
      <mxGeometry x="140" y="40" width="80" height="50" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

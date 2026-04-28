# Draw.io Text Wrapping Test

Tests that long text wraps within boxes (html=1 + htmlLabels=true fix).

```xml
<mxGraphModel dx="1000" dy="600" grid="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="box1" value="Customer manually reads hundreds of change notes" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="200" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="box2" value="Customer cross-references their own return config manually" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="40" y="180" width="200" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="box3" value="Auto-ingested and AI-analysed against each customer configuration" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="300" y="40" width="200" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="e1" edge="1" source="box1" target="box2" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

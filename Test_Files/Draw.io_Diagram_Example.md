# Draw.io Diagram Examples

This file demonstrates PrintDown's support for embedded Draw.io XML diagrams.

## Simple Flowchart Example

Here's a simple flowchart showing a decision process:

```xml
<mxGraphModel dx="800" dy="600" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    
    <!-- Start node -->
    <mxCell id="start" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;aspect=fixed;" vertex="1" parent="1">
      <mxGeometry x="350" y="20" width="80" height="80" as="geometry"/>
    </mxCell>
    
    <!-- Decision node -->
    <mxCell id="decision" value="Are you ready?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="320" y="140" width="140" height="100" as="geometry"/>
    </mxCell>
    
    <!-- Process node 1 -->
    <mxCell id="process1" value="Take Action" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="140" y="310" width="120" height="60" as="geometry"/>
    </mxCell>
    
    <!-- Process node 2 -->
    <mxCell id="process2" value="Wait" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
      <mxGeometry x="480" y="310" width="120" height="60" as="geometry"/>
    </mxCell>
    
    <!-- End node -->
    <mxCell id="end" value="End" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;aspect=fixed;" vertex="1" parent="1">
      <mxGeometry x="350" y="470" width="80" height="80" as="geometry"/>
    </mxCell>
    
    <!-- Edges -->
    <mxCell id="edge1" edge="1" source="start" target="decision" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell id="edge2" edge="1" source="decision" target="process1" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint as="sourcePoint" x="340" y="240"/>
        <mxPoint as="targetPoint" x="200" y="310"/>
      </mxGeometry>
      <mxCell id="label2" vertex="1" connectable="0" parent="edge2">
        <mxGeometry relative="1" as="geometry">
          <mxPoint x="-20" y="-10" as="offset"/>
        </mxGeometry>
      </mxCell>
    </mxCell>
    
    <mxCell id="edge3" edge="1" source="decision" target="process2" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint as="sourcePoint" x="460" y="240"/>
        <mxPoint as="targetPoint" x="540" y="310"/>
      </mxGeometry>
    </mxCell>
    
    <mxCell id="edge4" edge="1" source="process1" target="end" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint as="sourcePoint" x="200" y="370"/>
        <mxPoint as="targetPoint" x="390" y="470"/>
      </mxGeometry>
    </mxCell>
    
    <mxCell id="edge5" edge="1" source="process2" target="end" parent="1">
      <mxGeometry relative="1" as="geometry">
        <mxPoint as="sourcePoint" x="540" y="370"/>
        <mxPoint as="targetPoint" x="410" y="470"/>
      </mxGeometry>
    </mxCell>
  </root>
</mxGraphModel>
```

## Architecture Diagram

Here's an example of an architecture diagram:

```xml
<mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    
    <!-- Client -->
    <mxCell id="client" value="Client Application" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
      <mxGeometry x="50" y="50" width="150" height="60" as="geometry"/>
    </mxCell>
    
    <!-- API Gateway -->
    <mxCell id="api" value="API Gateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
      <mxGeometry x="350" y="50" width="150" height="60" as="geometry"/>
    </mxCell>
    
    <!-- Microservices -->
    <mxCell id="service1" value="Auth Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="150" y="200" width="130" height="60" as="geometry"/>
    </mxCell>
    
    <mxCell id="service2" value="Data Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="350" y="200" width="130" height="60" as="geometry"/>
    </mxCell>
    
    <mxCell id="service3" value="Cache Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
      <mxGeometry x="550" y="200" width="130" height="60" as="geometry"/>
    </mxCell>
    
    <!-- Database -->
    <mxCell id="db" value="Database" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
      <mxGeometry x="350" y="350" width="150" height="60" as="geometry"/>
    </mxCell>
    
    <!-- Edges -->
    <mxCell edge="1" source="client" target="api" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell edge="1" source="api" target="service1" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell edge="1" source="api" target="service2" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell edge="1" source="api" target="service3" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell edge="1" source="service2" target="db" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    
    <mxCell edge="1" source="service1" target="db" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## Using Draw.io Diagrams in PrintDown

### Features

1. **View Diagrams**: Draw.io XML diagrams embedded in `xml` code blocks are automatically rendered
2. **Edit in Draw.io**: Click the "✎ Edit in Draw.io" button to open the diagram in the online Draw.io editor
3. **Copy XML**: Click the "📋 Copy XML" button to copy the diagram XML to your clipboard
4. **PDF Export**: Diagrams are included when exporting to PDF

### Best Practices

- Use proper XML structure with `<mxGraphModel>` root element
- Include `dx` and `dy` attributes for canvas dimensions
- Use meaningful IDs for cells (`vertex`, `edge`, etc.)
- Organize your diagram with proper styling and colors
- Reference diagrams from the RETNA-191 or other documentation

### Example Markdown Syntax

```markdown
# My Diagram

Here's my diagram:

\`\`\`xml
<mxGraphModel dx="..." dy="...">
  <!-- Your draw.io XML content here -->
</mxGraphModel>
\`\`\`
```

## Mathematical Diagram with Draw.io

PrintDown supports both Draw.io diagrams AND mathematical expressions, so you can combine them:

$$
E = mc^2
$$

The diagram above uses Draw.io's visual editor to create professional-looking flowcharts and architecture diagrams, while mathematical expressions can be added using LaTeX syntax.

---

**Note**: For full interactive editing capabilities, use the "Edit in Draw.io" button to open diagrams in the web editor. PrintDown provides a preview and overlay the diagram with action buttons.

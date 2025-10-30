# Mermaid Diagram Examples

## Sequence Diagram

Here's a simple sequence diagram showing user authentication:

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Server
    participant Database
    
    User->>Browser: Enter credentials
    Browser->>Server: POST /login
    Server->>Database: Verify credentials
    Database-->>Server: User data
    Server-->>Browser: Auth token
    Browser-->>User: Redirect to dashboard
```

## Another Sequence Diagram

This shows an API request flow:

```mermaid
sequenceDiagram
    autonumber
    Actor Client
    Client->>+API: GET /users
    API->>+Database: SELECT * FROM users
    Database-->>-API: User records
    API-->>-Client: JSON response
    Note right of Client: Client processes<br/>the data
```

## Flowchart Example

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[End]
```

## Class Diagram

```mermaid
classDiagram
    class User {
        +String name
        +String email
        +login()
        +logout()
    }
    class Admin {
        +String permissions
        +manageUsers()
    }
    User <|-- Admin
```

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Success: Complete
    Processing --> Failed: Error
    Success --> [*]
    Failed --> Idle: Retry
```

## Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Research           :a1, 2024-01-01, 7d
    Design             :a2, after a1, 5d
    section Development
    Backend            :b1, after a2, 10d
    Frontend           :b2, after a2, 8d
    section Testing
    QA Testing         :c1, after b1, 5d
```

## Git Graph

```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

## More Text

You can mix diagrams with regular markdown content. The diagrams will be rendered inline with your text, math equations, and other content.

Math still works: $E = mc^2$

And display math:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

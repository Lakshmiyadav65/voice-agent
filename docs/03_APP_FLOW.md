# AI Employee Platform --- App Flow

## User Experiences

1.  Business Owner/User
2.  Internal AI Trainer/AI Manager
3.  Customer

## Business Owner Flow

``` text
Login -> Dashboard -> AI Employee
                  -> Leads
                  -> Calls
                  -> WhatsApp
                  -> Appointments
                  -> Business Information
```

## Business Information

``` text
Business Information
  -> Products / Services
  -> Prices
  -> Inventory
  -> Offers
  -> FAQs
  -> Documents
  -> Policies
```

## Price Update

``` text
Dashboard -> Business Information -> Products -> Product
-> Edit Price -> Save Now OR Schedule Change -> Confirm
```

## Scheduled Change

``` text
Current: ₹15,000
New: ₹17,000
Effective: Tomorrow 2:00 PM
-> Confirm -> Scheduled
```

## AI Trainer Flow

``` text
Login -> Trainer Dashboard -> Businesses -> AI Employee
-> Knowledge / Business Data / Training / Test Lab
-> Conversations / Knowledge Gaps / Analytics / Versions / Deployments
```

## New Business Setup

``` text
Select Business
-> Create AI Employee
-> Collect Business Information
-> Upload Data/Documents
-> Prepare Business Brain
-> Configure Behaviour
-> Create Tests
-> Run Tests
-> Fix Failures
-> Approve
-> Deploy
```

## Customer Voice Journey

``` text
Lead -> AI Call -> Greeting -> Understand Requirement
-> Qualify -> Answer Questions -> Take Action
-> Follow-up / Appointment -> End
```

## AI Routing

``` text
Customer Question
-> Router
-> Product/Price -> Structured DB
-> FAQ/Policy -> Knowledge Base
-> Availability -> Business Data/API
-> Appointment -> Calendar
-> WhatsApp -> WhatsApp Tool
-> Unknown -> Safe Response/Human
```

## WhatsApp

``` text
Customer asks for details
-> Detect WhatsApp intent
-> Identify relevant product/project
-> Retrieve current information
-> Generate approved message
-> WhatsApp API
-> Customer
-> Record status
```

## Appointment

``` text
Request -> Required information -> Check availability
-> Available? -> Book OR suggest alternatives
-> Confirmation -> CRM update
```

## Failed Conversation

``` text
Conversation -> Evaluation -> Failure
-> Knowledge/Behaviour Gap -> Trainer Review
-> Fix -> Retest -> New Version -> Deploy
```

## Versioning

``` text
LIVE v1.8 -> Improvement -> v1.9 TESTING
-> Evaluation -> Pass -> Approve -> v1.9 LIVE
```

## Edge States

-   No products: show empty state.
-   No calls: show empty state.
-   Unknown product: do not fabricate an answer.
-   WhatsApp failure: never report false delivery.
-   Voice/database failure: retry safely and log.

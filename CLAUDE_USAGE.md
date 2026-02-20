# Claude Usage During Development

## How Claude Was Used

Claude was used as a **pair programming partner** throughout the entire development process, following the Markdown-first approach required by the brief. The workflow was:

1. **Spec-first planning** — I described the business requirements from the brief and asked Claude to help structure a detailed Markdown specification (`docs/spec.md`) covering the checkout flow, API contract, pricing rules, idempotency contract, acceptance criteria, edge cases, and error scenarios. During this phase, Claude helped discover industry patterns and best practices (e.g., RESTful idempotency patterns, two-phase commit approaches for distributed systems, DynamoDB conditional write patterns) that informed the planning decisions.

2. **Architecture design** — Claude helped plan the project structure, DynamoDB table design (using `cartId` as partition key + idempotency key), and the two-phase idempotency approach (pre-check + conditional write). Claude suggested best practices from AWS serverless architecture patterns and idempotency design patterns to ensure a robust solution.

3. **Implementation** — Claude generated the TypeScript implementation following the spec, with each service module (`validation.ts`, `pricing.ts`, `order.ts`, `payment.ts`) built independently before being composed in the handler.

4. **Test authoring** — Tests were written to map directly to acceptance criteria from the spec. Claude generated the test structure and mocking setup (using `aws-sdk-client-mock`).

5. **CDK infrastructure** — Claude scaffolded the AWS CDK stack defining the Lambda, API Gateway, and DynamoDB resources.

## Example Prompts

### Planning Phase (Iterative Back-and-Forth)

1. **Initial request**: "Based on the brief file, let's plan a solution"
   - Claude read the brief and proposed a high-level architecture with a mermaid diagram
   - Claude researched and suggested industry best practices for idempotency patterns, DynamoDB conditional writes, and serverless architecture patterns to inform the design
   - I asked clarifying questions about testing framework (Jest vs Vitest), IaC tool (SAM vs CDK), and payment service approach (mock vs interface-only)

2. **Refinement**: After Claude asked about testing framework, IaC, and payment mock approach, I provided preferences:
   - "Jest for testing, AWS CDK for infrastructure, and a mock payment service with configurable failure"
   - Claude then created a detailed plan with todos, project structure, and implementation order

3. **Spec review**: "Let's make sure the spec covers all edge cases mentioned in the brief"
   - Claude expanded the spec with detailed edge case handling (empty cart, zero quantity, negative prices, malformed input, race conditions)

4. **Architecture validation**: "How should we handle the race condition where two requests with the same cartId arrive simultaneously?"
   - Claude explained the two-phase approach: GetItem pre-check for fast retries, then conditional PutItem to prevent duplicates even under concurrency

5. **Idempotency clarification**: "Should we return 200 or 201 when an existing order is found?"
   - Claude confirmed: 200 for idempotent replays (existing order), 201 only for newly created orders, per RESTful conventions

### Implementation Phase

6. **Implementation kickoff**: "Implement the plan as specified"
   - Claude started with the spec, then project setup, types, and worked through each service module systematically

7. **Mid-implementation guidance**: When tests failed due to jest.config.ts requiring ts-node:
   - I observed the error and Claude fixed it by converting to jest.config.js, explaining the dependency issue

8. **Test structure**: "Make sure each acceptance criterion has at least one test"
   - Claude organized tests to map directly to AC-1 through AC-8, with descriptive test names that reference the criterion numbers

### Code Improvements Phase

9. **Validation library suggestion**: "@src/services/validation.ts:4-7 is this better done with Zod? or a lib designed for this?"
   - Claude recommended Zod as an industry-standard validation library
   - Explained benefits: code reduction (104 → 70 lines), declarative schemas, better maintainability, type safety
   - Refactored validation to use Zod schemas while preserving all existing error messages and test compatibility

10. **Type inference from schemas**: "can we use any of our zod validation to define the types?"
   - Claude suggested using `z.infer<typeof Schema>` to derive TypeScript types from Zod schemas
   - This creates a single source of truth: types are automatically inferred from validation schemas
   - Eliminates duplication and ensures types always match validation rules
   - Updated `CartItem` and `CheckoutRequest` to be inferred types, keeping other types (like `PricedItem`, `Order`) as interfaces since they're computed/not validated

## What I Verified Myself (Through Code Review & Pair Programming)

Each verification point below involved **thorough code review** and **iterative pair programming** with Claude. Rather than accepting output blindly, I engaged in back-and-forth discussions, asked clarifying questions, and requested refinements until I was confident in the implementation.

- **Spec correctness** — Conducted a line-by-line review of the generated spec against the original brief, discussing with Claude to ensure all requirements were captured. Iterated on the idempotency contract and payment ordering sections until they precisely matched the business requirements.

- **Pricing math** — Manually verified the rounding logic (`roundTo2`) with Claude, walking through edge cases like `1.11 × 3 = 3.33` and discussing whether banker's rounding was appropriate. Reviewed tax calculation step-by-step to confirm it rounds correctly at each stage.

- **Idempotency edge cases** — Collaboratively reviewed the two-phase approach with Claude, discussing race condition scenarios and verifying that both GetItem pre-check and conditional PutItem work together correctly. Asked Claude to explain the failure modes and edge cases.

- **Error propagation** — Traced the error flow from each service through the handler with Claude, verifying each error path. Discussed whether error messages were user-friendly and whether HTTP status codes matched REST conventions. Iterated on error handling until satisfied.

- **Test coverage** — Reviewed each test with Claude, mapping them to acceptance criteria. Discussed whether edge cases were adequately covered and requested additional tests where gaps were identified. Verified test names clearly reference acceptance criteria.

- **Type safety** — Ran `tsc --noEmit` and reviewed any type errors with Claude, discussing whether strict settings were appropriate and iterating on type definitions until compilation was clean.

- **DynamoDB mock setup** — Reviewed the mock setup with Claude, discussing the injection pattern (`setDocClient`) and verifying that `aws-sdk-client-mock` properly intercepts SDK calls. Tested various scenarios together to ensure mocks behave correctly.

- **Zod refactoring** — After Claude suggested Zod, I reviewed the refactored code line-by-line, comparing it to the original manual validation. Discussed error message formatting to ensure backward compatibility, and iterated on the error handling logic until all 58 tests passed.

- **Type inference** — Reviewed the type inference approach with Claude, discussing the trade-offs of inferred types vs interfaces. Verified that the circular dependency between `types/index.ts` and `services/validation.ts` was handled correctly, and confirmed types compile correctly.
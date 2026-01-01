# Refactoring Guide - Common Mistakes to Avoid

This document outlines common mistakes made during refactoring and how to avoid them.

## Critical Rule: When Removing Conditional Rendering

### The Mistake
When removing conditional rendering like:
```tsx
{condition ? (
  <ComponentA />
) : (
  <ComponentB />
)}
```

**DO NOT** just remove one branch:
```tsx
{condition ? (
  <ComponentA />
) : (
  // Oops! Left orphaned code here
  const x = ...;
  return <ComponentB />
)}
```

This creates **orphaned code** that's not inside any function, component, or map, causing syntax errors.

### The Correct Way
**Remove BOTH branches** or replace with the desired single branch:
```tsx
{/* Always render ComponentA - condition removed */}
<ComponentA />
```

### Real Example from TableView.tsx

**WRONG** (causes syntax error):
```tsx
{groupByScene ? (
  Array.from(shotsByScene.entries()).map(...)
) : (
  // Removing this but leaving code inside = SYNTAX ERROR
  sortedShots.map((shot) => {
    const index = ...;  // ❌ Orphaned code!
    return <ShotRow ... />
  })
)}
```

**CORRECT**:
```tsx
{/* Always group by scene - no conditional */}
{Array.from(shotsByScene.entries()).map(([sceneId, sceneShots]) => {
  // All code is properly inside the map callback
  return (
    <React.Fragment key={sceneId}>
      ...
    </React.Fragment>
  );
})}
```

## How to Safely Remove Conditionals

1. **Identify the conditional**: Find `condition ? A : B`
2. **Decide which branch to keep**: Usually the "true" branch
3. **Remove the entire conditional structure**: Delete `condition ?` and `: B` parts
4. **Keep only the desired branch**: Keep `A` (or `B` if that's what you want)
5. **Verify syntax**: Ensure all code is inside proper JSX/function contexts
6. **Test**: Run the build to catch syntax errors immediately

## TableView-Specific Rules

### Always Group by Scene
- **NEVER** add back conditional rendering for scene grouping
- The table **ALWAYS** displays shots grouped by scene
- Look for comments: `/* CRITICAL: Always group by scene */`

### Sorting Rules
- Scenes: Always sorted by `orderIndex` (low to high)
- Shots within scenes: Always sorted by `orderIndex` (low to high)
- Sorting happens in `useMemo` hooks - don't modify the sorting logic

### Compact Mode
- Compact mode hides: checkbox column, arrow buttons column, actions column
- Use `{!compactMode && <Element />}` pattern
- Don't create separate rendering paths - use conditional rendering within JSX

## StoryboardView-Specific Rules

### Image Carousel
- Navigation arrows are **outside** the image area (below it)
- This is intentional for accessibility
- Don't move arrows back inside the image area

### Removed Fields
- Status label: Removed from cards
- Camera Notes: Removed from Inspector
- Animation Notes: Removed from Inspector
- Duration: Removed from detailed view
- **DO NOT** add these back

## Testing After Refactoring

Always run:
```bash
npm run build
```

This will catch:
- Syntax errors (orphaned code)
- TypeScript errors
- Missing imports
- Type mismatches

## Code Review Checklist

Before submitting changes, verify:
- [ ] No orphaned code (code not inside functions/components/maps)
- [ ] All conditionals are complete (both branches or single branch)
- [ ] No syntax errors (run `npm run build`)
- [ ] TableView always groups by scene
- [ ] Sorting logic is unchanged
- [ ] Compact mode works correctly
- [ ] Removed fields stay removed

## React Hooks and Temporal Dead Zone Errors

### The Mistake: Referencing Variables Before Declaration

**Error**: `Uncaught ReferenceError: Cannot access 'item' before initialization`

This occurs when:
1. A `useEffect` hook references a variable (like `item`) that is declared later in the component
2. The hook is placed before the variable declaration, causing a temporal dead zone error

**Solution**: Always use store/state values directly in hooks, not computed variables. See `IMPLEMENTATION.md` section "React Hooks and Temporal Dead Zone Errors" for detailed examples.

### The Mistake: Conditional Hook Calls

**Error**: React warnings about hooks being called conditionally

This occurs when:
1. Hooks are placed after early returns
2. Hooks are inside conditional statements

**Solution**: All hooks must be called unconditionally at the top level, before any early returns.

### The Mistake: Unmemoized Callbacks Causing Infinite Loops

**Error**: Infinite re-renders, blank screens, performance issues

This occurs when:
1. Callback functions passed as props are not memoized with `useCallback`
2. Child components have `useEffect` hooks that depend on these callbacks
3. The callback changes on every render, triggering the effect repeatedly

**Solution**: Always wrap callbacks passed as props in `useCallback` with proper dependencies.

## Common Error Messages

### "Unexpected token"
- **Cause**: Orphaned code (code outside any function/component)
- **Fix**: Ensure all code is inside proper JSX/function contexts
- **Example**: Variables declared outside map callbacks

### "Cannot find name"
- **Cause**: Variable used but not defined, or in wrong scope
- **Fix**: Check variable declarations and scope

### "JSX expressions must have one parent element"
- **Cause**: Multiple elements returned without wrapper
- **Fix**: Wrap in Fragment or single parent element

## Remember

When in doubt:
1. **Read the code structure** before making changes
2. **Remove conditionals completely** if you want single behavior
3. **Test immediately** after refactoring
4. **Check for orphaned code** - if it's not inside a function/component/map, it's wrong


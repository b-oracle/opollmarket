

## Fix: "Token contract not configured" race condition

### Problem
There's a race condition between two `useEffect` hooks:
1. **Settings fetch** (line 152): Loads `tokenContractAddress` from `commission_settings` — async, takes time.
2. **Gate check trigger** (line 737): Fires immediately when `isConnected` is true and `gateChecks.length === 0`.

When the wallet connects before the settings finish loading, `tokenContractAddress` is still `""` (its initial state), so the code hits the `else` branch at line 667 and shows "Token contract not configured."

### Fix
In `src/pages/Create.tsx`:

1. **Add a `settingsLoaded` state flag** (e.g. `const [settingsLoaded, setSettingsLoaded] = useState(false)`), set to `true` after the commission_settings fetch completes.

2. **Guard the gate check trigger** — change the `useEffect` dependency from just `isConnected` to also require `settingsLoaded`:
   ```typescript
   useEffect(() => {
     if (isConnected && settingsLoaded && !gatePassed && !gateRunning && gateChecks.length === 0) {
       runGateCheck();
     }
   }, [isConnected, settingsLoaded]);
   ```

3. **Set the flag** at the end of the settings fetch `useEffect` (after setting all state values).

This is a one-file, minimal change that ensures the gate check never runs before the contract addresses are available.


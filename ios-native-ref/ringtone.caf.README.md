# ringtone.caf

The APNs alert payload references `sound: "ringtone.caf"` and the CallKit
`CXProviderConfiguration.ringtoneSound` does too. The file must be **bundled
into the App target** (not the extension) at the root of `ios/App/App/`.

Constraints (Apple):
- ≤ 30 seconds long.
- AIFF, WAV, or CAF container.
- Linear PCM, MA4 (IMA/ADPCM), µLaw, or aLaw codec.

Generate from any mp3:

```bash
afconvert ringtone.mp3 ringtone.caf -d ima4 -f caff -v
```

Then drag `ringtone.caf` into Xcode → ensure `App` target is checked under
"Target Membership". `npx cap sync ios` will not move it for you.

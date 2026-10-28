# GSiS v0.8.2a

Item 083: Contacts viewport portable contact export, based on full v0.8.2.

The first column now reads add. Each row has an unboxed + button with horizontal touch padding and normal text height. Clicking exports that person's VCF locally from the loaded directory, with no additional Contacts API request or permission popup.

| Contact field | Source |
| --- | --- |
| Prefix | GSPS |
| First Name | Entire TTb Name |
| Last Name | Entire Statutory Name |

The file includes available mobile and work email values. An internal extension is labelled as an extension, not invented as a telephone number. Missing fields are omitted, complete names are preserved, and reserved characters and Unicode are encoded for vCard import.

The old Google Contacts module, duplicate scan, create request and saved-state buttons are removed from this action. A download retry link and concise import guidance remain available. GSiS sign-in, school directory permissions and all other suite components retain their v0.8.2 behaviour.

No deployment, production data update, teacher message or phone contact creation was performed. See VALIDATION.md for the checks and actual-device limitations.

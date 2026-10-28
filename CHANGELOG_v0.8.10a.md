# GSiS v0.8.10a

Calendar frontend patch on v0.8.10.

Move Update birthdays from Contacts and its inline status into People & Roles. The action is absent from other Calendar pages and keeps its existing Admin access, selected-year handling and Sync Staff workflow.

Deploy only Calendar_Frontend_v0.8.10a.zip. No Apps Script, notification Worker or configuration change.

Verification: Calendar birthday responsive browser check exercises all ten pages for Admin/non-Admin visibility and five viewport widths. Existing birthday backend reconciliation checks also run.

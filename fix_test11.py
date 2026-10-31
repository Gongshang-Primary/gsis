# If `visibleRows length` is 1, why is it rendering 3 rows?
# Let's inspect `app.js` renderData function again.
with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

# wait!
# renderStaffGrid('dataGrid',renderDataData,dataEdits,()=>{renderDataStatus()},dataLoading||dataSaving||!!dataRequest||!contactDataEditable());
# If dataLoading is true, it renders locked. But if `visibleRows` was passed in, why did it render 3?
# Oh! In `loadContactData`, `renderStaffGrid` is called directly during loading!
# `renderStaffGrid('dataGrid',{...result,rows:[]},dataEdits,changed,true);`
# `renderStaffGrid('dataGrid',{...result,rows:result.rows.slice(start,start+15)},dataEdits,changed,true,true);`
# Ah! `loadContactData` renders the grid BEFORE `dataLoading` is set to false! And it does NOT use `renderData()`.
# Then `renderData()` is called in the `finally` block!
# But in our test, does it call `renderData()` in the `finally` block?
# If `dataLoading` is true, then `loadContactData` is running. We did `await new Promise(r => setTimeout(r, 100));`.
# Maybe the promise inside `loadContactData` takes longer? Let's check `dataLoading` in the test.

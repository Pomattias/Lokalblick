import test from "node:test";
import assert from "node:assert/strict";
import {PORTFOLIO_FILTER_VIEWS, filterPresentation} from "../frontend/v2/filter-presentation.js";

test("shared filters appear on every portfolio view", () => {
  for (const view of PORTFOLIO_FILTER_VIEWS) {
    assert.deepEqual(filterPresentation(view), {
      supported:true,scopedDetail:false,show:true,canToggle:false
    }, view);
  }
});

test("configuration and standalone unscoped tools do not advertise irrelevant filters", () => {
  for (const view of ["sources","people","businesses","settings","more","datamodel"]) {
    assert.deepEqual(filterPresentation(view), {
      supported:false,scopedDetail:false,show:false,canToggle:false
    }, view);
  }
});

test("drilling into a property collapses shared filters but keeps them accessible", () => {
  const scoped={propertyId:"property-123",person:"person-1",q:"tak"};
  assert.deepEqual(filterPresentation("properties",scoped), {
    supported:true,scopedDetail:true,show:false,canToggle:true
  });
  assert.deepEqual(filterPresentation("plan",scoped,"",true), {
    supported:true,scopedDetail:true,show:true,canToggle:true
  });
  assert.equal(filterPresentation("properties",{q:"tak"}).show,true);
});

test("open contract detail collapses filters; closing restores them", () => {
  assert.equal(filterPresentation("contracts",{},"contract-123").show,false);
  assert.equal(filterPresentation("contracts",{},"contract-123",true).show,true);
  assert.equal(filterPresentation("contracts",{},"").show,true);
  assert.equal(filterPresentation("plan",{},"contract-123").show,true);
});

test("record selection does not expose irrelevant filters in settings", () => {
  assert.equal(filterPresentation("settings",{propertyId:"property-123"}).show,false);
  assert.equal(filterPresentation("settings",{propertyId:"property-123"}).canToggle,false);
});

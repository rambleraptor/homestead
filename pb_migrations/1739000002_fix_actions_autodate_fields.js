/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Fix actions collection
  const actions = app.findCollectionByNameOrId("actions");

  if (!actions.fields.getByName("created")) {
    actions.fields.add(new AutodateField({
      name: "created",
      onCreate: true,
      onUpdate: false,
    }));
  }

  if (!actions.fields.getByName("updated")) {
    actions.fields.add(new AutodateField({
      name: "updated",
      onCreate: true,
      onUpdate: true,
    }));
  }

  app.save(actions);

  // Fix action_runs collection
  const actionRuns = app.findCollectionByNameOrId("action_runs");

  if (!actionRuns.fields.getByName("created")) {
    actionRuns.fields.add(new AutodateField({
      name: "created",
      onCreate: true,
      onUpdate: false,
    }));
  }

  if (!actionRuns.fields.getByName("updated")) {
    actionRuns.fields.add(new AutodateField({
      name: "updated",
      onCreate: true,
      onUpdate: true,
    }));
  }

  app.save(actionRuns);
}, (app) => {
  // No rollback needed - these are standard fields
});

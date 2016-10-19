angular.module('app').controller('ProjectListController', function($scope, $location, growl, UserService) {
    var vm = this;

    vm.refresh = function() {
        UserService.socket.emit('project_list', {}, function(err, projects) {
            if (err) {
                growl.error(err);
            } else {
                vm.projects = projects;
                $scope.$apply();
            }
        });
    };
    vm.refresh();

    vm.viewProject = function(id) {
        $location.path('/projects/view/' + id);
    };

    vm.editProject = function(id) {
        $location.path('/projects/edit/' + id);
    };

    vm.runProject = function(id) {
        UserService.socket.emit('project_run', id, function(err) {
            if (err) {
                growl.error(err);
            } else {
                growl.success('Running project...');
            }
        });
    };

    vm.deleteProject = function(id) {
        if (confirm('Are you sure you want to delete this project?')) {
            UserService.socket.emit('project_delete', id, function(err) {
                if (err) {
                    growl.error(err);
                } else {
                    growl.success('Project deleted successfully.');
                    vm.refreshProjects();
                }
            });
        }
    };
});
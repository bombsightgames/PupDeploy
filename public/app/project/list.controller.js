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

    $scope.$on('socket:project_status', function(event, data) {
        if (!vm.projects) {
            return;
        }

        var project = null;
        for (var i=0; i<vm.projects.length; i++) {
            var p = vm.projects[i];
            if (data.project == p._id) {
                project = p;
                break;
            }
        }

        if (project) {
            project.status = data.status;
            project.error = data.error;
            $scope.$apply();
        }
    });
});
angular.module('app').controller('ProjectEditController', function($rootScope, $scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.addStep = function() {
        vm.project.steps.push({
            commands: ''
        });
    };

    vm.removeStep = function(index) {
        if (vm.project.steps[index].commands === '' || confirm('Are you sure you want to remove this step?')) {
            vm.project.steps.splice(index, 1);
        }
    };

    vm.addNotification = function() {
        vm.project.notifications.push({
            type: 'email'
        });
    };

    vm.removeNotification = function(index) {
        if (confirm('Are you sure you want to remove this notification?')) {
            vm.project.notifications.splice(index, 1);
        }
    };

    vm.addServer = function() {
        vm.project.servers.push({
            host: ''
        });
    };

    vm.removeServer = function(index) {
        if (vm.project.servers[index].host === '' || confirm('Are you sure you want to remove this server?')) {
            vm.project.servers.splice(index, 1);
        }
    };

    vm.deleteProject = function() {
        if (confirm('Are you sure you want to delete this project?')) {
            UserService.socket.emit('project_delete', id, function(err) {
                if (err) {
                    growl.error(err);
                } else {
                    growl.success('Project deleted successfully.');
                    $location.path('/projects');
                }
            });
        }
    };

    vm.save = function() {
        UserService.socket.emit('project_update', vm.project, function(err) {
            if (err) {
                growl.error(err);
            } else {
                if (id) {
                    growl.success('Project updated successfully.');
                } else {
                    growl.success('Project created successfully.');
                }

                $location.path('/projects');
            }
        });
    };

    $scope.$on('socket:slack_setup', function(event, data) {
        if (data.error) {
            growl.error(data.error);
        } else {
            console.log('Slack setup!', data);
            for (var i=0; i<vm.project.notifications.length; i++) {
                var notification = vm.project.notifications[i];
                if (data.token == notification.token) {
                    notification.slack = data.slack;
                    growl.success('Slack setup successfully!');
                    break;
                }
            }

            $scope.$apply();
        }
    });

    vm.authSlack = function(notification) {
        notification.token = Math.floor(Math.random()*100000000);

        var slackUrl = 'https://slack.com/oauth/authorize?scope=incoming-webhook&client_id=90733115808.92334895841&state=' + notification.token + '&redirect_uri=' + encodeURIComponent('http://pupdeploy.bombsightgames.com/api/' + window.location.protocol + '//' + window.location.host + '/slack');
        if (notification.token && slackUrl) {
            window.open(slackUrl, '_blank', 'width=600,height=500' + ', top=' + ((window.innerHeight - 500) / 2) + ', left=' + ((window.innerWidth - 600) / 2));
        }
    };

    vm.loading = true;
    if (id) {
        UserService.socket.emit('project_get', id, function(err, project) {
            if (err) {
                growl.error(err);
                $location.path('/projects');
            } else {
                vm.project = project;
                vm.notifications = [];
            }

            vm.loading = false;
            $rootScope.$apply();
        });
    } else {
        vm.project = {
            name: '',
            steps: [],
            servers: [],
            settings: {
                haltOnFailure: true,
                enableMonitoring: false,
                enableNotifications: false
            },
            auth: {
                type: 'password'
            },
            notifications: []
        };
        vm.addStep();
        vm.addServer();

        vm.loading = false;
    }
});